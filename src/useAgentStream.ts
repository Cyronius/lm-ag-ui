import { useState, useRef, useCallback, useEffect, Dispatch } from 'react';
import {
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
import { ToolDefinition, UseAgentOptions } from './index';
import { getFrontEndTools } from './toolUtils';
import { IntermediateMessageSuppressor } from './intermediateMessageSuppressor';

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

export interface StreamHandle {
    state: AgentState;
    stateRef: React.MutableRefObject<AgentState>;
    dispatch: Dispatch<AgentAction>;
    subscriber: AgentSubscriber;
    onRunFinished: (cb: (p: RunFinishedPayload) => void) => () => void;
    /**
     * Marks the next `RunStarted` event as a chained continuation of the
     * current user turn rather than a fresh user-initiated run. Called by
     * `useFrontendToolRunner` immediately before `submitToolResults`. Drives
     * first/final-message preservation when `suppressIntermediateAssistantMessages`
     * is on; a no-op when the flag is off.
     */
    markChainedRun: () => void;
    /**
     * Defensive clear: callers about to start a fresh user-initiated run
     * (e.g. user typed a message) should call this so a stale chained-run
     * marker from a prior turn cannot bleed in. `useAgent.invokeToolByName`
     * calls this automatically; consumers calling `agentClient.runAgent`
     * directly while `suppressIntermediateAssistantMessages` is enabled
     * should call it themselves.
     */
    clearPendingChain: () => void;
}

type StreamOptions = Pick<UseAgentOptions, 'onLifecycleEvent' | 'onError' | 'safetyTimeoutMs' | 'suppressIntermediateAssistantMessages'> & {
    tools?: Record<string, ToolDefinition>;
};

/**
 * Subscribes to AG-UI events, runs the reducer, and exposes a RunFinished
 * event to consumers. No AgentClient mutation beyond receiving it for the
 * safety-timeout abort, and no tool execution logic.
 */
export function useAgentStream(
    client: AgentClient,
    sessionIsActive: boolean,
    options: StreamOptions
): StreamHandle {
    const { onLifecycleEvent, onError, safetyTimeoutMs, suppressIntermediateAssistantMessages, tools = {} } = options;
    const effectiveSafetyTimeoutMs = safetyTimeoutMs ?? 300_000;

    const [state, setState] = useState<AgentState>(initialAgentState);
    const stateRef = useRef<AgentState>(state);
    const dispatch = useCallback((action: AgentAction) => {
        const next = agentReducer(stateRef.current, action);
        if (next === stateRef.current) return;
        stateRef.current = next;
        setState(next);
    }, []);

    // First/final-message preservation under `suppressIntermediateAssistantMessages`.
    // The suppressor owns all turn-scoped state (first-text-emitted flag, chained-run
    // flag, buffered intermediate segments). The `enabled` flag is sticky from setup
    // options but we keep it live in case the option changes between renders.
    const suppressorRef = useRef<IntermediateMessageSuppressor>(
        new IntermediateMessageSuppressor(!!suppressIntermediateAssistantMessages)
    );
    suppressorRef.current.setEnabled(!!suppressIntermediateAssistantMessages);

    const markChainedRun = useCallback(() => { suppressorRef.current.markChainedRun(); }, []);
    const clearPendingChain = useCallback(() => { suppressorRef.current.clearPendingChain(); }, []);

    const runFinishedListenersRef = useRef<Set<(p: RunFinishedPayload) => void>>(new Set());
    const onRunFinished = useCallback((cb: (p: RunFinishedPayload) => void) => {
        runFinishedListenersRef.current.add(cb);
        return () => { runFinishedListenersRef.current.delete(cb); };
    }, []);

    // Safety timeout: force-end runs stuck for over the configured timeout
    useEffect(() => {
        if (!sessionIsActive) return;
        const timeoutId = setTimeout(() => {
            console.warn(`[AG-UI] Safety timeout: forcing run end after ${effectiveSafetyTimeoutMs}ms`);
            dispatch({ type: 'CLEAR_STREAMING' });
            dispatch({ type: 'CLEAR_TOOL_BUFFERS' });
            dispatch({ type: 'SET_ABORTED', value: true });
            client.abortRun();
            onError?.({ code: 'timeout', message: `Run exceeded safety timeout of ${effectiveSafetyTimeoutMs}ms` });
            dispatch({
                type: 'ADD_MESSAGE',
                message: {
                    id: `timeout_${Date.now()}`,
                    role: 'assistant',
                    content: 'The request timed out. Please try again.',
                },
            });
        }, effectiveSafetyTimeoutMs);
        return () => clearTimeout(timeoutId);
    }, [sessionIsActive, effectiveSafetyTimeoutMs, client, dispatch, onError]);

    // Resolve latest tools on every render via ref so subscriber handlers see fresh map.
    const toolsRef = useRef(tools);
    toolsRef.current = tools;

    const addErrorMessage = useCallback((error: unknown) => {
        dispatch({
            type: 'ADD_MESSAGE',
            message: { id: uuidv4(), role: 'assistant', content: `${error}` },
        });
    }, [dispatch]);

    // Stable subscriber identity. Handlers close over refs (stateRef, toolsRef)
    // so fresh reads work without re-creating the subscriber.
    const subscriberRef = useRef<AgentSubscriber>({
        onEvent: () => {},
        onRunStartedEvent: () => {},
        onTextMessageStartEvent: () => {},
        onTextMessageContentEvent: () => {},
        onTextMessageEndEvent: () => {},
        onStateSnapshotEvent: () => {},
        onRunFinishedEvent: () => {},
        onRunErrorEvent: () => {},
        onToolCallStartEvent: () => {},
        onToolCallArgsEvent: () => {},
        onToolCallEndEvent: () => {},
        onToolCallResultEvent: () => {},
    });

    subscriberRef.current.onEvent = () => {};

    subscriberRef.current.onRunStartedEvent = ({ event }: { event: RunStartedEvent }) => {
        console.info('[AG-UI] RunStarted:', {
            threadId: event.threadId,
            runId: event.runId,
            message: stateRef.current.messages.slice(-1)[0]?.content,
        });
        suppressorRef.current.onRunStarted();
        onLifecycleEvent?.({ type: 'run_started' });
        dispatch({ type: 'SNAPSHOT_PRE_RUN' });
    };

    // Flush the in-flight turn (text + unflushed tool calls) into messages and
    // fire the lifecycle announcement. Used at turn boundaries (next
    // TextMessageStart with content already buffered) and at RunFinished.
    const flushTurn = () => {
        const before = stateRef.current;
        const hasUnflushedToolCall = Array.from(before.toolCallBuffers.entries()).some(
            ([id, buf]) => !before.flushedToolCallIds.has(id) && !buf.resultReceived
        );
        if (!before.streamingText.trim() && !hasUnflushedToolCall) return;
        dispatch({ type: 'FINALIZE_TURN' });
        const announced = stateRef.current.lastAnnouncedAssistantText;
        if (announced) {
            console.info('[AG-UI] TextMessage: ', announced);
            onLifecycleEvent?.({ type: 'message_added', role: 'assistant', content: announced });
        }
    };

    subscriberRef.current.onTextMessageStartEvent = ({ event }: { event: TextMessageStartEvent }) => {
        const decision = suppressorRef.current.onTextMessageStart(event.messageId);
        if (decision === 'buffer') {
            // Suppressor will hold this segment; final disposition decided at RUN_FINISHED.
            return;
        }
        console.info('[AG-UI] TextMessageStart:', { messageId: event.messageId, role: event.role });
        // If a previous turn's text/tool-calls are still pending, commit them
        // before this new text segment begins.
        flushTurn();
    };

    subscriberRef.current.onTextMessageContentEvent = ({ event }: { event: TextMessageContentEvent }) => {
        if (suppressorRef.current.isBuffered(event.messageId)) {
            suppressorRef.current.appendToBuffer(event.messageId, event.delta);
            return;
        }
        dispatch({ type: 'TEXT_DELTA', messageId: event.messageId, delta: event.delta });
    };

    subscriberRef.current.onTextMessageEndEvent = ({ event }: { event: TextMessageEndEvent }) => {
        if (suppressorRef.current.isBuffered(event.messageId)) {
            // Log the suppressed narration so it's still visible in the console
            // even though it won't be committed to the message list.
            const buffered = suppressorRef.current.getBufferedText(event.messageId) ?? '';
            console.debug('[AG-UI] AssistantMessage (suppressed):', { messageId: event.messageId, content: buffered });
            // Keep buffered; final disposition decided at RUN_FINISHED.
            return;
        }
        console.debug('[AG-UI] AssistantMessage:', { messageId: event.messageId, content: stateRef.current.streamingText });
        console.info('[AG-UI] TextMessageEnd:', { messageId: event.messageId });
    };

    subscriberRef.current.onStateSnapshotEvent = ({ event }: { event: StateSnapshotEvent }) => {
        console.info('[AG-UI] StateSnapshot:', { snapshot: event.snapshot });
        dispatch({ type: 'MERGE_STATE_SNAPSHOT', snapshot: event.snapshot as Record<string, unknown> });
    };

    subscriberRef.current.onRunFinishedEvent = ({ event }: { event: RunFinishedEvent }) => {
        console.info('[AG-UI] RunFinished:', { event });
        // Resolve buffered text BEFORE flushTurn so the decision uses the
        // run's tool-call presence (cleared by FINALIZE_TURN inside flushTurn).
        // Tool calls whose result has already arrived in this run (backend
        // tools) don't gate a chained continuation — they're terminal, so the
        // trailing assistant text in the same run is the final text and must
        // commit, not drop.
        const before = stateRef.current;
        const hasUnflushedToolCall = Array.from(before.toolCallBuffers.entries()).some(
            ([id, buf]) => !before.flushedToolCallIds.has(id) && !buf.resultReceived
        );
        const { commit, dropped } = suppressorRef.current.onRunFinished(hasUnflushedToolCall);
        if (dropped.length > 0) {
            console.info('[AG-UI] Dropped intermediate narration:', dropped.map(s => s.text));
        }
        for (const seg of commit) {
            if (!seg.text.trim()) continue;
            dispatch({
                type: 'ADD_MESSAGE',
                message: { id: seg.messageId, role: 'assistant', content: seg.text },
            });
            onLifecycleEvent?.({ type: 'message_added', role: 'assistant', content: seg.text });
        }
        try {
            flushTurn();
        } catch (error) {
            console.error('Error creating assistant message:', error);
            const errorDetail = error instanceof Error ? error.message : String(error);
            addErrorMessage(`Error processing assistant response: ${errorDetail}`);
        } finally {
            dispatch({ type: 'CLEAR_STREAMING' });
            client.endRun();
        }

        // Snapshot must be taken AFTER SET_MESSAGES / CLEAR_STREAMING have been dispatched,
        // so listeners see finalMessages with the assembled assistant message.
        const snap = stateRef.current;
        const pendingToolCalls: PendingToolCall[] = [];
        for (const [toolCallId, tc] of snap.toolCallBuffers.entries()) {
            if (!tc.resultReceived) {
                pendingToolCalls.push({ toolCallId, name: tc.name, argsBuffer: tc.argsBuffer });
            }
        }
        const payload: RunFinishedPayload = {
            finalMessages: snap.messages,
            pendingToolCalls,
            stateSnapshot: snap,
        };
        for (const cb of runFinishedListenersRef.current) {
            try { cb(payload); } catch (e) { console.error('RunFinished listener error:', e); }
        }
    };

    subscriberRef.current.onRunErrorEvent = ({ event }: { event: RunErrorEvent }) => {
        console.info('[AG-UI] RunError:', { message: event.message });
        if (stateRef.current.isAborted) {
            dispatch({ type: 'SET_ABORTED', value: false });
            console.info('[AG-UI] Run aborted by user');
            onError?.({ code: 'aborted', message: event.message, raw: event });
            return;
        }
        dispatch({ type: 'CLEAR_STREAMING' });
        suppressorRef.current.reset();
        dispatch({
            type: 'ADD_MESSAGE',
            message: { id: `error_${Date.now()}`, role: 'assistant', content: `Error: ${event.message}` },
        });
        onError?.({ code: 'run_error', message: event.message, raw: event });
        client.endRun();
    };

    subscriberRef.current.onToolCallStartEvent = ({ event }: { event: ToolCallStartEvent }) => {
        console.info('[AG-UI] ToolCallStart:', {
            toolCallId: event.toolCallId,
            toolCallName: event.toolCallName,
            parentMessageId: event.parentMessageId,
        });
        onLifecycleEvent?.({ type: 'tool_used', toolName: event.toolCallName });
        dispatch({
            type: 'TOOL_CALL_START',
            toolCallId: event.toolCallId,
            name: event.toolCallName,
            parentMessageId: event.parentMessageId,
        });
    };

    subscriberRef.current.onToolCallArgsEvent = ({ event }: { event: ToolCallArgsEvent }) => {
        console.info('[AG-UI] ToolCallArgs:', { toolCallId: event.toolCallId, delta: event.delta });
        dispatch({ type: 'TOOL_CALL_ARGS', toolCallId: event.toolCallId, delta: event.delta });
    };

    subscriberRef.current.onToolCallEndEvent = ({ event }: { event: ToolCallEndEvent }) => {
        console.info('[AG-UI] ToolCallEnd:', { toolCallId: event.toolCallId });
    };

    subscriberRef.current.onToolCallResultEvent = ({ event }: { event: ToolCallResultEvent }) => {
        console.info('[AG-UI] ToolCallResult:', { toolCallId: event.toolCallId, content: event.content });
        try {
            const toolResultMessage: Message = {
                id: `tool_result_${event.toolCallId}_${Date.now()}`,
                role: 'tool',
                content: event.content || '',
                toolCallId: event.toolCallId,
            };
            dispatch({ type: 'TOOL_CALL_RESULT', toolCallId: event.toolCallId, message: toolResultMessage });

            const toolCall = stateRef.current.toolCallBuffers.get(event.toolCallId);
            if (toolCall) {
                const tool = toolsRef.current[toolCall.name];
                if (tool?.onResult) {
                    try {
                        const args = JSON.parse(toolCall.argsBuffer || '{}');
                        const updateState = (toolName: string, data: unknown) =>
                            dispatch({ type: 'UPDATE_TOOL_STATE', toolName, data });
                        const getState = (toolName?: string) =>
                            toolName ? stateRef.current.globalState[toolName] : stateRef.current.globalState;
                        tool.onResult(args, event.content || '', updateState, getState);
                    } catch (error) {
                        console.error(`Error calling onResult for tool ${toolCall.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error creating tool result message:', error);
            const errorDetail = error instanceof Error ? error.message : String(error);
            addErrorMessage(`Error processing tool result: ${errorDetail}`);
        }
    };

    return {
        state,
        stateRef,
        dispatch,
        subscriber: subscriberRef.current,
        onRunFinished,
        markChainedRun,
        clearPendingChain,
    };
}

// Re-export for consumers building their own runners
export { getFrontEndTools };
