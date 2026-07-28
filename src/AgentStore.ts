import type {
    AgentSubscriber,
    Message,
    TextMessageStartEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    StateSnapshotEvent,
} from '@ag-ui/client';
import { v4 as uuidv4 } from 'uuid';
import { agentReducer, initialAgentState, AgentState, AgentAction } from './agentReducer';
import { AgentClient } from './AgentClient';
import { Session, ToolDefinition, ForwardedPropsBuilder, AgentLifecycleEvent } from './types';
import { getFrontEndTools } from './toolUtils';
import { IntermediateMessageSuppressor } from './intermediateMessageSuppressor';
import { createRunWatchdog, RunWatchdog } from './runWatchdog';
import { executeFrontendToolCall } from './frontendToolExecution';

export interface PendingToolCall {
    toolCallId: string;
    name: string;
    argsBuffer: string;
}

export interface RunFinishedPayload {
    finalMessages: Message[];
    pendingToolCalls: PendingToolCall[];
    stateSnapshot: AgentState;
}

/** The mutable-between-renders subset of UseAgentOptions. Update via `setOptions`. */
export interface AgentStoreOptions {
    tools?: Record<string, ToolDefinition>;
    buildForwardedProps?: ForwardedPropsBuilder;
    onLifecycleEvent?: (event: AgentLifecycleEvent) => void;
    onError?: (err: { code: 'run_error' | 'timeout' | 'aborted'; message: string; raw?: unknown }) => void;
    safetyTimeoutMs?: number;
    idleTimeoutMs?: number;
    suppressIntermediateAssistantMessages?: boolean;
}

/** One immutable snapshot of everything React (or any subscriber) renders from. */
export interface AgentSnapshot {
    state: AgentState;
    session: Session;
    isStreaming: boolean;
    hasPendingToolWork: boolean;
    isBusy: boolean;
}

// `safetyTimeoutMs` is the absolute hard cap for a whole run (never reset).
// `idleTimeoutMs` is the adaptive window: it resets on every AG-UI event, so
// a run that keeps making progress isn't killed — only a genuine stall trips it.
const DEFAULT_MAX_MS = 900_000;
const DEFAULT_IDLE_MS = 180_000;

/**
 * The React-free core of the library: subscribes to AG-UI events, runs the
 * reducer, owns the session mirror, the intermediate-message suppressor, the
 * run watchdog, and the frontend tool-runner orchestration.
 *
 * The store IS the AgentSubscriber — its handler methods are arrow-function
 * class properties so they stay bound when passed around or destructured.
 *
 * React binds via `useSyncExternalStore(store.subscribe, store.getSnapshot)`;
 * non-React consumers can use the same subscribe/getSnapshot contract directly.
 */
export class AgentStore implements AgentSubscriber {
    readonly client: AgentClient;

    private state: AgentState = initialAgentState;
    private session: Session;
    private pendingToolWork = false;

    private options: AgentStoreOptions;
    private suppressor: IntermediateMessageSuppressor;
    private watchdog: RunWatchdog | null = null;

    private listeners = new Set<() => void>();
    private runFinishedListeners = new Set<(p: RunFinishedPayload) => void>();
    private cachedSnapshot: AgentSnapshot | null = null;
    private readonly serverSnapshot: AgentSnapshot;

    // Reentrancy guard. Handlers are awaited, so there is a window between a
    // RUN_FINISHED and the submitToolResults that starts the next run. A second
    // RUN_FINISHED arriving in that window must not re-process the not-yet-cleared
    // tool buffers.
    private isProcessingToolCalls = false;

    // Cache for getFrontEndTools keyed on the tools reference.
    private frontEndTools: Record<string, ToolDefinition> = {};
    private frontEndToolsSource: Record<string, ToolDefinition> | undefined;

    constructor(client: AgentClient, options: AgentStoreOptions = {}) {
        this.client = client;
        this.options = options;
        this.suppressor = new IntermediateMessageSuppressor(!!options.suppressIntermediateAssistantMessages);
        this.refreshFrontEndTools();

        this.session = client.session;
        client.setSessionChangeCallback(this.handleSessionChange);

        this.serverSnapshot = Object.freeze({
            state: initialAgentState,
            session: { ...this.session },
            isStreaming: false,
            hasPendingToolWork: false,
            isBusy: false,
        });
    }

    // ---- useSyncExternalStore contract -------------------------------------

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    getSnapshot = (): AgentSnapshot => {
        if (!this.cachedSnapshot) {
            const isStreaming = this.session.isActive;
            this.cachedSnapshot = {
                state: this.state,
                session: { ...this.session },
                isStreaming,
                hasPendingToolWork: this.pendingToolWork,
                isBusy: isStreaming || this.pendingToolWork,
            };
        }
        return this.cachedSnapshot;
    };

    /** SSR-safe: a single frozen construction-time snapshot, constant reference. */
    getServerSnapshot = (): AgentSnapshot => this.serverSnapshot;

    private emitChange(): void {
        this.cachedSnapshot = null;
        for (const l of this.listeners) l();
    }

    // ---- options / lifecycle ----------------------------------------------

    /**
     * Latest-wins options update. Called by `useAgent` from an every-render
     * effect; safe to call at any time from non-React consumers.
     */
    setOptions(options: AgentStoreOptions): void {
        this.options = options;
        this.suppressor.setEnabled(!!options.suppressIntermediateAssistantMessages);
        this.refreshFrontEndTools();
    }

    private refreshFrontEndTools(): void {
        if (this.frontEndToolsSource !== this.options.tools) {
            this.frontEndToolsSource = this.options.tools;
            this.frontEndTools = getFrontEndTools(this.options.tools ?? {});
        }
    }

    /**
     * Quiesce the store on unmount: stop the watchdog and abort any in-flight
     * run. NON-terminal — under React StrictMode the same store instance is
     * disposed between the dev double-mount and must remain fully usable.
     */
    dispose(): void {
        if (this.client.session.isActive) {
            this.client.abortRun();
        }
        this.watchdog?.stop();
        this.watchdog = null;
        this.cachedSnapshot = null;
    }

    // ---- state ------------------------------------------------------------

    getState(): AgentState {
        return this.state;
    }

    dispatch = (action: AgentAction): void => {
        const next = agentReducer(this.state, action);
        if (next === this.state) return;
        this.state = next;
        this.emitChange();
    };

    private addErrorMessage(error: unknown): void {
        this.dispatch({
            type: 'ADD_MESSAGE',
            message: { id: uuidv4(), role: 'assistant', content: `${error}` },
        });
    }

    // Session mirror + watchdog driven by isActive transitions. This reproduces
    // the previous per-leg watchdog semantics: each chained tool round-trip
    // (endRun → async tool execution → startNewRun) stops and re-arms both
    // timers, so the absolute cap bounds a single leg, not the whole chain.
    private handleSessionChange = (session: Session): void => {
        const wasActive = this.session.isActive;
        this.session = session;
        if (session.isActive && !wasActive) {
            this.watchdog?.stop();
            const wd = createRunWatchdog({
                idleMs: this.options.idleTimeoutMs ?? DEFAULT_IDLE_MS,
                maxMs: this.options.safetyTimeoutMs ?? DEFAULT_MAX_MS,
                onExpire: (reason) => this.handleTimeout(reason),
            });
            this.watchdog = wd;
            wd.start();
        } else if (!session.isActive && wasActive) {
            this.watchdog?.stop();
            this.watchdog = null;
        }
        this.emitChange();
    };

    private handleTimeout(reason: 'idle' | 'max'): void {
        const effectiveIdleMs = this.options.idleTimeoutMs ?? DEFAULT_IDLE_MS;
        const effectiveMaxMs = this.options.safetyTimeoutMs ?? DEFAULT_MAX_MS;
        console.warn(`[AG-UI] ${reason === 'idle' ? 'Idle' : 'Max-run'} timeout: forcing run end`);
        this.dispatch({ type: 'CLEAR_STREAMING' });
        this.dispatch({ type: 'CLEAR_TOOL_BUFFERS' });
        this.dispatch({ type: 'SET_ABORTED', value: true });
        this.setPendingToolWork(false);
        this.client.abortRun();
        this.options.onError?.({
            code: 'timeout',
            message: reason === 'idle'
                ? `Run idle for ${effectiveIdleMs}ms with no events`
                : `Run exceeded max duration of ${effectiveMaxMs}ms`,
        });
        this.dispatch({
            type: 'ADD_MESSAGE',
            message: {
                id: `timeout_${Date.now()}`,
                role: 'assistant',
                content: 'The request timed out. Please try again.',
            },
        });
    }

    private setPendingToolWork(value: boolean): void {
        if (this.pendingToolWork === value) return;
        this.pendingToolWork = value;
        this.emitChange();
    }

    // ---- run-finished listeners / chained-run markers ----------------------

    onRunFinished(cb: (p: RunFinishedPayload) => void): () => void {
        this.runFinishedListeners.add(cb);
        return () => { this.runFinishedListeners.delete(cb); };
    }

    /**
     * Marks the next `RunStarted` event as a chained continuation of the
     * current user turn rather than a fresh user-initiated run. Called
     * internally immediately before `submitToolResults`. Drives
     * first/final-message preservation when `suppressIntermediateAssistantMessages`
     * is on; a no-op when the flag is off.
     */
    markChainedRun = (): void => { this.suppressor.markChainedRun(); };

    /**
     * Defensive clear: callers about to start a fresh user-initiated run
     * (e.g. user typed a message) should call this so a stale chained-run
     * marker from a prior turn cannot bleed in. `invokeToolByName` calls this
     * automatically; consumers calling `client.runAgent` directly while
     * `suppressIntermediateAssistantMessages` is enabled should call it themselves.
     */
    clearPendingChain = (): void => { this.suppressor.clearPendingChain(); };

    /**
     * Start a fresh user-initiated turn: clears any stale chained-run marker
     * and mints a new run on the client. This is the entry point consumers
     * should use before calling `client.runAgent` directly — `startNewRun`
     * alone is not "new turn" (the tool runner also calls it mid-chain), and
     * a leftover chain marker would bleed suppression state into the new turn.
     */
    beginTurn = (): Session => {
        this.clearPendingChain();
        return this.client.startNewRun();
    };

    // ---- facade helpers ----------------------------------------------------

    updateToolState = (toolName: string, data: unknown): void => {
        this.dispatch({ type: 'UPDATE_TOOL_STATE', toolName, data });
    };

    getGlobalState = (toolName?: string): unknown => {
        return toolName ? this.state.globalState[toolName] : this.state.globalState;
    };

    addMessage = (message: Message): void => {
        this.dispatch({ type: 'ADD_MESSAGE', message });
    };

    setMessages = (messages: Message[]): void => {
        this.dispatch({ type: 'SET_MESSAGES', messages });
    };

    clearMessages = (): void => {
        this.dispatch({ type: 'CLEAR_MESSAGES' });
    };

    getToolNameFromCallId = (toolCallId: string): string | undefined => {
        return this.state.toolCallIdToName.get(toolCallId);
    };

    terminateRun = (): void => {
        this.client.abortRun();
        this.dispatch({ type: 'TERMINATE' });
        this.setPendingToolWork(false);
    };

    getForwardedProps = (extraProps?: Record<string, any>): Record<string, any> => {
        const baseProps = this.options.buildForwardedProps?.() ?? {};
        return { ...baseProps, ...extraProps };
    };

    invokeToolByName = async (
        toolName: string,
        additionalForwardedProps?: Record<string, any>,
        stateUpdates?: Record<string, any>
    ): Promise<void> => {
        const tool = this.options.tools?.[toolName];
        if (!tool) {
            console.error(`Tool ${toolName} not found`);
            this.addMessage({
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `Error: Tool '${toolName}' not found`,
            });
            return;
        }

        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: `invoke the ${toolName} tool. Parameters=${JSON.stringify(additionalForwardedProps || {})}`,
        };

        this.beginTurn();

        try {
            if (stateUpdates) {
                this.dispatch({ type: 'PATCH_GLOBAL_STATE', patch: stateUpdates });
                this.client.setState({
                    ...this.state.globalState,
                    ...stateUpdates,
                });
            }

            const forwardedProps = this.getForwardedProps(additionalForwardedProps);

            await this.client.runAgent(
                [...this.state.messages, userMessage],
                [tool.definition],
                this,
                forwardedProps
            );
        } catch (error) {
            console.error('Agent execution failed:', error);
            this.addMessage({
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `Error executing tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`,
            });
            throw error;
        }
    };

    // ---- turn flushing -----------------------------------------------------

    // Flush the in-flight turn (text + unflushed tool calls) into messages and
    // fire the lifecycle announcement. Used at turn boundaries (next
    // TextMessageStart with content already buffered) and at RunFinished.
    private flushTurn(): void {
        const before = this.state;
        // Any tool call not yet flushed needs FINALIZE_TURN — including ones
        // whose result already streamed in (resultReceived: true). Excluding
        // those here left tool-only turns with no narration text (the common
        // case for a plain lookup call) with a `tool` result message and no
        // owning assistant.tool_calls message ever created, since FINALIZE_TURN
        // is the only place that pairing is assembled.
        const hasUnflushedToolCall = Array.from(before.toolCallBuffers.entries()).some(
            ([id]) => !before.flushedToolCallIds.has(id)
        );
        if (!before.streamingText.trim() && !hasUnflushedToolCall) return;
        this.dispatch({ type: 'FINALIZE_TURN' });
        const announced = this.state.lastAnnouncedAssistantText;
        if (announced) {
            console.info('[AG-UI] TextMessage: ', announced);
            this.options.onLifecycleEvent?.({ type: 'message_added', role: 'assistant', content: announced });
        }
    }

    // ---- AgentSubscriber handlers (arrow properties: bound `this`) ---------

    // Every AG-UI event resets the idle watchdog. `kick()` is a no-op when the
    // watchdog isn't running, so startup/teardown races are harmless.
    onEvent = (): void => { this.watchdog?.kick(); };

    onRunStartedEvent = ({ event }: { event: RunStartedEvent }): void => {
        console.info('[AG-UI] RunStarted:', {
            threadId: event.threadId,
            runId: event.runId,
            message: this.state.messages.slice(-1)[0]?.content,
        });
        this.suppressor.onRunStarted();
        this.options.onLifecycleEvent?.({ type: 'run_started' });
        this.dispatch({ type: 'SNAPSHOT_PRE_RUN' });
    };

    onTextMessageStartEvent = ({ event }: { event: TextMessageStartEvent }): void => {
        const decision = this.suppressor.onTextMessageStart(event.messageId);
        if (decision === 'buffer') {
            // Suppressor will hold this segment; final disposition decided at RUN_FINISHED.
            return;
        }
        console.info('[AG-UI] TextMessageStart:', { messageId: event.messageId, role: event.role });
        // If a previous turn's text/tool-calls are still pending, commit them
        // before this new text segment begins.
        this.flushTurn();
    };

    onTextMessageContentEvent = ({ event }: { event: TextMessageContentEvent }): void => {
        if (this.suppressor.isBuffered(event.messageId)) {
            this.suppressor.appendToBuffer(event.messageId, event.delta);
            return;
        }
        this.dispatch({ type: 'TEXT_DELTA', messageId: event.messageId, delta: event.delta });
    };

    onTextMessageEndEvent = ({ event }: { event: TextMessageEndEvent }): void => {
        if (this.suppressor.isBuffered(event.messageId)) {
            // Log the suppressed narration so it's still visible in the console
            // even though it won't be committed to the message list.
            const buffered = this.suppressor.getBufferedText(event.messageId) ?? '';
            console.debug('[AG-UI] AssistantMessage (suppressed):', { messageId: event.messageId, content: buffered });
            // Keep buffered; final disposition decided at RUN_FINISHED.
            return;
        }
        console.debug('[AG-UI] AssistantMessage:', { messageId: event.messageId, content: this.state.streamingText });
        console.info('[AG-UI] TextMessageEnd:', { messageId: event.messageId });
    };

    onStateSnapshotEvent = ({ event }: { event: StateSnapshotEvent }): void => {
        console.info('[AG-UI] StateSnapshot:', { snapshot: event.snapshot });
        this.dispatch({ type: 'MERGE_STATE_SNAPSHOT', snapshot: event.snapshot as Record<string, unknown> });
    };

    onRunFinishedEvent = ({ event }: { event: RunFinishedEvent }): void => {
        console.info('[AG-UI] RunFinished:', { event });
        // Resolve buffered text BEFORE flushTurn so the decision uses the
        // run's tool-call presence (cleared by FINALIZE_TURN inside flushTurn).
        // Tool calls whose result has already arrived in this run (backend
        // tools) don't gate a chained continuation — they're terminal, so the
        // trailing assistant text in the same run is the final text and must
        // commit, not drop.
        const before = this.state;
        const hasUnflushedToolCall = Array.from(before.toolCallBuffers.entries()).some(
            ([id, buf]) => !before.flushedToolCallIds.has(id) && !buf.resultReceived
        );
        const { commit, dropped } = this.suppressor.onRunFinished(hasUnflushedToolCall);
        if (dropped.length > 0) {
            console.info('[AG-UI] Dropped intermediate narration:', dropped.map(s => s.text));
        }
        for (const seg of commit) {
            if (!seg.text.trim()) continue;
            this.dispatch({
                type: 'ADD_MESSAGE',
                message: { id: seg.messageId, role: 'assistant', content: seg.text },
            });
            this.options.onLifecycleEvent?.({ type: 'message_added', role: 'assistant', content: seg.text });
        }
        try {
            this.flushTurn();
        } catch (error) {
            console.error('Error creating assistant message:', error);
            const errorDetail = error instanceof Error ? error.message : String(error);
            this.addErrorMessage(`Error processing assistant response: ${errorDetail}`);
        } finally {
            this.dispatch({ type: 'CLEAR_STREAMING' });
            this.client.endRun();
        }

        // Snapshot must be taken AFTER the flush/CLEAR_STREAMING dispatches,
        // so listeners see finalMessages with the assembled assistant message.
        const snap = this.state;
        const pendingToolCalls: PendingToolCall[] = [];
        for (const [toolCallId, tc] of snap.toolCallBuffers.entries()) {
            if (!tc.resultReceived) {
                pendingToolCalls.push({ toolCallId, name: tc.name, argsBuffer: tc.argsBuffer });
            }
        }
        // Set BEFORE the async runner starts: this keeps isBusy true across the
        // endRun → tool execution → startNewRun gap, so consumers gating a send
        // button on isBusy can't race the pending tool chain.
        this.setPendingToolWork(pendingToolCalls.length > 0);

        const payload: RunFinishedPayload = {
            finalMessages: snap.messages,
            pendingToolCalls,
            stateSnapshot: snap,
        };
        for (const cb of this.runFinishedListeners) {
            try { cb(payload); } catch (e) { console.error('RunFinished listener error:', e); }
        }

        // Drive the async tool runner; route any unexpected rejection to a
        // visible assistant message.
        void this.processPendingToolCalls().catch((error: unknown) => {
            this.addErrorMessage(error);
        });
    };

    onRunErrorEvent = ({ event }: { event: RunErrorEvent }): void => {
        console.info('[AG-UI] RunError:', { message: event.message });
        // A chained continuation that errors out will never emit RunFinished,
        // so pending tool work must clear here or isBusy sticks true forever.
        this.setPendingToolWork(false);
        if (this.state.isAborted) {
            this.dispatch({ type: 'SET_ABORTED', value: false });
            console.info('[AG-UI] Run aborted by user');
            this.options.onError?.({ code: 'aborted', message: event.message, raw: event });
            return;
        }
        // Symmetric with onRunFinishedEvent: a tool result may already have
        // streamed in (buffer resultReceived: true) before the run errored
        // out on a later step. Without this flush, that tool result is
        // abandoned mid-turn with no owning assistant.tool_calls message ever
        // created — an orphaned `tool` message that a later full-history send
        // gets rejected for.
        try {
            this.flushTurn();
        } catch (error) {
            console.error('Error creating assistant message:', error);
        }
        this.dispatch({ type: 'CLEAR_STREAMING' });
        this.suppressor.reset();
        this.dispatch({
            type: 'ADD_MESSAGE',
            message: { id: `error_${Date.now()}`, role: 'assistant', content: `Error: ${event.message}` },
        });
        this.options.onError?.({ code: 'run_error', message: event.message, raw: event });
        this.client.endRun();
    };

    onToolCallStartEvent = ({ event }: { event: ToolCallStartEvent }): void => {
        console.info('[AG-UI] ToolCallStart:', {
            toolCallId: event.toolCallId,
            toolCallName: event.toolCallName,
            parentMessageId: event.parentMessageId,
        });
        this.options.onLifecycleEvent?.({ type: 'tool_used', toolName: event.toolCallName });
        this.dispatch({
            type: 'TOOL_CALL_START',
            toolCallId: event.toolCallId,
            name: event.toolCallName,
            parentMessageId: event.parentMessageId,
        });
    };

    onToolCallArgsEvent = ({ event }: { event: ToolCallArgsEvent }): void => {
        console.info('[AG-UI] ToolCallArgs:', { toolCallId: event.toolCallId, delta: event.delta });
        this.dispatch({ type: 'TOOL_CALL_ARGS', toolCallId: event.toolCallId, delta: event.delta });
    };

    onToolCallEndEvent = ({ event }: { event: ToolCallEndEvent }): void => {
        console.info('[AG-UI] ToolCallEnd:', { toolCallId: event.toolCallId });
    };

    onToolCallResultEvent = ({ event }: { event: ToolCallResultEvent }): void => {
        console.info('[AG-UI] ToolCallResult:', { toolCallId: event.toolCallId, content: event.content });
        try {
            const toolResultMessage: Message = {
                id: `tool_result_${event.toolCallId}_${Date.now()}`,
                role: 'tool',
                content: event.content || '',
                toolCallId: event.toolCallId,
            };
            this.dispatch({ type: 'TOOL_CALL_RESULT', toolCallId: event.toolCallId, message: toolResultMessage });

            const toolCall = this.state.toolCallBuffers.get(event.toolCallId);
            if (toolCall) {
                const tool = this.options.tools?.[toolCall.name];
                if (tool?.onResult) {
                    try {
                        const args = JSON.parse(toolCall.argsBuffer || '{}');
                        tool.onResult(args, event.content || '', this.updateToolState, this.getGlobalState);
                    } catch (error) {
                        console.error(`Error calling onResult for tool ${toolCall.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error creating tool result message:', error);
            const errorDetail = error instanceof Error ? error.message : String(error);
            this.addErrorMessage(`Error processing tool result: ${errorDetail}`);
        }
    };

    // ---- frontend tool runner ----------------------------------------------

    private async processPendingToolCalls(): Promise<void> {
        if (this.isProcessingToolCalls) return;
        this.isProcessingToolCalls = true;

        let stopAfterToolCall = false;
        const toolMessages: Message[] = [];

        const executeFrontendTool = async (toolName: string, argsJson: string | null, toolCallId: string): Promise<Message | null> => {
            const tool = this.frontEndTools[toolName];
            // Always yields a result message — a parse failure or a handler
            // throw/rejection becomes an { ok: false } tool result rather than
            // a stray assistant message with no result submitted for the call.
            const { message, args, result, executed } = await executeFrontendToolCall(
                tool,
                toolName,
                argsJson,
                toolCallId,
                {
                    updateState: this.updateToolState,
                    getState: this.getGlobalState,
                    stopAfterToolCall: () => { stopAfterToolCall = true; },
                },
                Date.now()
            );
            this.dispatch({ type: 'ADD_MESSAGE', message });
            if (executed && tool.onResult) {
                try {
                    tool.onResult(args, result || '', this.updateToolState, this.getGlobalState);
                } catch (error) {
                    console.error(`Error calling onResult for tool ${toolName}:`, error);
                }
            }
            return message;
        };

        try {
            // Sequential await preserves message ordering and the
            // stopAfterToolCall / onResult semantics across multiple pending
            // calls (Promise.all is intentionally avoided here).
            for (const [toolCallId, toolCall] of this.state.toolCallBuffers.entries()) {
                if (toolCall.resultReceived) continue;
                let result: Message | null = null;
                if (this.frontEndTools[toolCall.name]) {
                    result = await executeFrontendTool(toolCall.name, toolCall.argsBuffer, toolCallId);
                } else {
                    console.warn(`[AG-UI] Tool '${toolCall.name}' is not a frontend tool and has no backend result — skipping`);
                }
                if (result) toolMessages.push(result);
            }
        } catch (error) {
            this.addErrorMessage(error);
        } finally {
            this.dispatch({ type: 'CLEAR_TOOL_BUFFERS' });
            if (toolMessages.length > 0) {
                const toolDefs = Object.values(this.options.tools ?? {}).map((t) => t.definition);
                this.client.startNewRun();
                const baseProps = this.options.buildForwardedProps?.() ?? {};
                const fwd = {
                    ...baseProps,
                    ...(stopAfterToolCall ? { stopAfterToolCall: true } : {}),
                };
                // Mark the upcoming run as a continuation so the turn-scoped
                // suppression state (first-text flag, buffers) is preserved
                // across the agentic chain.
                this.markChainedRun();
                this.client.submitToolResults(
                    this.state.messages,
                    this,
                    toolDefs,
                    fwd
                ).catch((error: unknown) => {
                    console.error('Tool result submission failed:', error);
                    this.client.endRun();
                    this.setPendingToolWork(false);
                    this.addErrorMessage(`Failed to submit tool results: ${error}`);
                });
            } else {
                // Nothing submittable (e.g. only backend tools with no result) —
                // no chained run will fire another RunFinished, so pending tool
                // work must clear here or isBusy sticks true forever.
                this.setPendingToolWork(false);
            }
            this.isProcessingToolCalls = false;
        }
    }
}
