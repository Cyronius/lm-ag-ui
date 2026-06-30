import { HttpAgent, AgentSubscriber, Message, State, Tool } from '@ag-ui/client';
import type { RunAgentResult } from '@ag-ui/client';
import { CustomHttpAgent } from './CustomHttpAgent';
import type { RequestHandler } from './CustomHttpAgent';
import { Session } from './index';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TIMEOUT_MS = 300000;

export type TokenProvider = () => Promise<string | null>;

/**
 * Produces the string content for the system message injected into the
 * thread. Zero-arg — the builder closes over whatever data it needs.
 * Return `null` (or empty string) to skip injection for this call.
 * Consumers should render only what the model needs to reason across
 * the session — omit large payloads. The returned string is compared to the
 * last-injected content for the thread; identical returns are NOT re-sent.
 * Independent of `forwardedProps`.
 */
export type SystemContextBuilder = () => string | null;

export interface AgentClientOptions {
    tokenProvider?: TokenProvider;
    requestHandler?: RequestHandler;
    timeout?: number;
    sendFullHistory?: boolean;
    initialThreadId?: string;
    /** Optional zero-arg renderer for the system-context snapshot. When not provided,
     *  no system context is injected. Independent of `forwardedProps`. */
    systemContextBuilder?: SystemContextBuilder;
    /** Appends `?debug=true` to the agent URL so the backend captures LLM input.
     *  Set once at construction — not runtime-toggleable. Drive from env/URL flag at app init. */
    debug?: boolean;
    /**
     * Optional outbound-message transformer. When set, every wire send
     * (`runAgent` and `submitToolResults`) passes the assembled message array
     * through this function immediately before `agent.setMessages`. Use this
     * for context shrinking (e.g. tombstoning stale tool results) without
     * needing each caller to remember to invoke it. Must preserve message
     * ordering and tool-call/tool-result pairing — only `content` may change.
     */
    pruneOutboundMessages?: (messages: Message[]) => Message[];
    /**
     * Extra query params appended to the agent URL (used for the run POST and,
     * via configService, the config-init GET). Array values are sent as repeated
     * keys (`?kbIds=a&kbIds=b`). Used for per-session backend tool selection such
     * as course knowledge bases (MOBI-KB-TOOL). Fixed at construction.
     */
    configParams?: Record<string, string | string[]>;
}

export class AgentClient {
    private agent: HttpAgent;
    private baseUrl: string;
    private agentId: string;
    private timeout: number;
    private tokenProvider?: TokenProvider;
    private requestHandler?: RequestHandler;
    private _session: Session;
    private _debug: boolean;
    private _sendFullHistory: boolean;
    private _systemContextBuilder?: SystemContextBuilder;
    private _pruneOutboundMessages?: (messages: Message[]) => Message[];
    private _configParams?: Record<string, string | string[]>;
    // Tracks the last rendered system-context content we injected for each thread,
    // so identical content isn't re-sent on subsequent runs in the same thread.
    // Cleared per-thread on endSession().
    private _injectedContextByThread: Map<string, string> = new Map();
    // Wall-clock start of the current agentic run (set in startNewRun, cleared in endRun).
    // Spans the full chain of LLM turns + tool round-trips, not just one runAgent call.
    private _runStartedAt: number | null = null;

    // Session change callback for React integration
    private onSessionChange?: (session: Session) => void;

    constructor(
        baseUrl: string = 'http://localhost:8000',
        agentId: string,
        options?: AgentClientOptions
    ) {
        if (!agentId || agentId.trim().length === 0) {
            throw new Error('AgentClient: agentId is required and cannot be empty');
        }
        if (!baseUrl || baseUrl.trim().length === 0) {
            throw new Error('AgentClient: baseUrl is required and cannot be empty');
        }
        if (options?.timeout !== undefined && (typeof options.timeout !== 'number' || options.timeout <= 0)) {
            throw new Error('AgentClient: timeout must be a positive number');
        }

        this.baseUrl = baseUrl;
        this.agentId = agentId;
        this.timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
        this.tokenProvider = options?.tokenProvider;
        this.requestHandler = options?.requestHandler;
        this._sendFullHistory = options?.sendFullHistory ?? false;
        this._systemContextBuilder = options?.systemContextBuilder;
        this._pruneOutboundMessages = options?.pruneOutboundMessages;
        this._configParams = options?.configParams;
        this._debug = options?.debug ?? false;
        console.info('[AG-UI] AgentClient constructed:', {
            agentId,
            sendFullHistory: this._sendFullHistory,
            hasPruneOutboundMessages: !!this._pruneOutboundMessages,
        });

        this.agent = this.createAgent();

        // Initialize session
        this._session = {
            threadId: options?.initialThreadId ?? null,
            runId: null,
            isActive: false
        };
    }

    // Build agent URL with optional debug + configParams query string.
    // configParams array values become repeated keys (?kbIds=a&kbIds=b) so the
    // backend reads them as a list (MOBI-KB-TOOL).
    private buildAgentUrl(): string {
        const base = `${this.baseUrl}/agent/${this.agentId}`;
        const search = new URLSearchParams();
        if (this._debug) search.append('debug', 'true');
        if (this._configParams) {
            for (const [key, value] of Object.entries(this._configParams)) {
                if (Array.isArray(value)) {
                    for (const v of value) search.append(key, v);
                } else {
                    search.append(key, value);
                }
            }
        }
        const qs = search.toString();
        return qs ? `${base}?${qs}` : base;
    }

    // Create the appropriate HttpAgent (custom or standard)
    private createAgent(): HttpAgent {
        const config = {
            url: this.buildAgentUrl(),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            }
        };
        return this.requestHandler
            ? new CustomHttpAgent(config, this.requestHandler)
            : new HttpAgent(config);
    }

    // Debug mode getter
    get debug(): boolean {
        return this._debug;
    }

    // Session getter
    get session(): Session {
        return { ...this._session };
    }

    // Internal method to update session and notify React
    private updateSession(updates: Partial<Session>) {
        this._session = { ...this._session, ...updates };
        this.onSessionChange?.(this.session);
    }

    // Set the callback for session changes (used by React context)
    setSessionChangeCallback(callback: (session: Session) => void) {
        this.onSessionChange = callback;
    }

    // Session management methods
    startNewRun(): Session {
        const newRunId = this.generateRunId();
        const threadId = this._session.threadId || this.generateThreadId();

        const newSession = {
            threadId,
            runId: newRunId,
            isActive: true
        };

        // Preserve the start time across chained tool round-trips so the
        // elapsed log covers the full agentic run, not each per-turn hop.
        if (this._runStartedAt == null) {
            this._runStartedAt = Date.now();
        }
        this.updateSession(newSession);
        return this.session;
    }

    endRun(): void {
        const startedAt = this._runStartedAt;
        this.updateSession({
            runId: null,
            isActive: false
        });

        if (startedAt == null) return;

        // Defer the elapsed log: useFrontendToolRunner calls startNewRun
        // synchronously after endRun when continuing a tool chain. Wait one
        // microtask to see whether the run actually ended or just hopped turns.
        queueMicrotask(() => {
            if (this._session.isActive) return;
            if (this._runStartedAt !== startedAt) return;
            const elapsedMs = Date.now() - startedAt;
            console.info('[AG-UI] agentic run complete', {
                threadId: this._session.threadId,
                elapsedMs,
                elapsedSec: +(elapsedMs / 1000).toFixed(2),
            });
            this._runStartedAt = null;
        });
    }

    abortRun(): void {
        this.agent.abortRun();
        this.agent.abortController = new AbortController();
        this.endRun();
    }

    endSession(): void {
        const prevThreadId = this._session.threadId;
        if (prevThreadId) {
            this._injectedContextByThread.delete(prevThreadId);
        }
        this.updateSession({
            threadId: null,
            runId: null,
            isActive: false
        });
    }

    /**
     * Render the system-context string using the configured builder.
     * Returns null when no builder is configured or the builder returns empty.
     * Independent of `forwardedProps`.
     */
    private renderSystemContext(): string | null {
        if (!this._systemContextBuilder) return null;
        const rendered = this._systemContextBuilder();
        return rendered && rendered.length > 0 ? rendered : null;
    }

    /**
     * Build a SystemMessage for the given thread.
     *
     * The per-thread dedup (skip re-sending an unchanged snapshot) is only safe
     * against a STATEFUL backend (`sendFullHistory: false`), which retains the
     * once-injected system message and rehydrates it on later turns. Under
     * `sendFullHistory: true` the backend is stateless and rehydrates nothing —
     * the client re-ships the whole transcript each turn — so the system context
     * must ride on EVERY send. Deduping it there strips the model's grounding on
     * every turn after the first (MOBI-CONTEXT-EVERY-TURN).
     *
     * Returns null when the content is empty, or (stateful backend only) when it
     * is unchanged since the last send for this thread.
     */
    private maybeBuildContextMessage(threadId: string): Message | null {
        const rendered = this.renderSystemContext();
        if (!rendered) return null;

        if (!this._sendFullHistory && this._injectedContextByThread.get(threadId) === rendered) {
            return null;
        }
        this._injectedContextByThread.set(threadId, rendered);

        return {
            id: `system_context_${Date.now()}`,
            role: 'system',
            content: rendered
        } as Message;
    }

    // Apply auth token to agent headers if a tokenProvider is configured
    private async applyAuthHeaders(): Promise<void> {
        if (this.tokenProvider) {
            const token = await this.tokenProvider();
            if (token) {
                this.agent.headers['Authorization'] = `Bearer ${token}`;
            }
        }
    }

    // Agent communication methods
    async runAgent(
        messages: Message[],
        tools: Tool[],
        subscriber: AgentSubscriber,
        forwardedProps: Record<string, any> = {}
    ): Promise<RunAgentResult> {
        // Use current session (always fresh)
        const threadId = this._session.threadId || this.generateThreadId();
        const runId = this._session.runId || this.generateRunId();

        try {
            await this.applyAuthHeaders();

            // Set the thread ID and messages on the agent
            this.agent.threadId = threadId;
            const contextMsg = this.maybeBuildContextMessage(threadId);
            // When sendFullHistory is false, backend owns history rehydration — send only the newest turn.
            const assembled = this._sendFullHistory
                ? (contextMsg ? [contextMsg, ...messages] : messages)
                : [contextMsg, messages[messages.length - 1]].filter(Boolean) as Message[];
            const outgoing = this._pruneOutboundMessages
                ? this._pruneOutboundMessages(assembled)
                : assembled;
            this.agent.setMessages(outgoing);

            console.info('[AG-UI] RunAgent start:', {
                threadId,
                runId,
                stopAfterToolCall: forwardedProps?.stopAfterToolCall === true,
                outgoingCount: outgoing.length,
            });

            const result = await this.agent.runAgent({
                runId,
                tools,
                context: [],
                forwardedProps
            }, subscriber);

            return result;
        } catch (error) {
            console.error('Agent execution error:', error);
            if (this._session.isActive) {
                this.endRun();
            }
            throw error;
        }
    }
    
    setState(state: State) {
        this.agent.setState(state)        
    }

    /**
     * `sendFullHistory` (set at construction) determines what is shipped on each call:
     *  - `true`  — frontend-controlled / stateless backend. The caller-provided messages
     *              array is sent verbatim (with the optional system-context message
     *              prepended). The backend holds no per-thread state and can scale
     *              horizontally. The `threadId` is still forwarded for observability.
     *  - `false` — backend-controlled / stateful backend. Only the newest turn is sent;
     *              the backend rehydrates prior history against `threadId`. Tool-result
     *              submissions filter to tool-role messages only.
     *
     *  Mismatching this flag with the backend contract causes either context loss
     *  (`false` against a stateless backend) or duplicated history (`true` against a
     *  stateful backend that also stores it). See README § Architecture.
     */
    async submitToolResults(
        toolMessages: Message[],
        subscriber: AgentSubscriber,
        tools: Tool[] = [],
        forwardedProps: Record<string, any> = {}
    ): Promise<RunAgentResult> {
        if (!this._session.threadId) {
            throw new Error('Thread ID is required for tool result submission');
        }

        // Generate new run ID for continuation
        const runId = this.generateRunId();

        try {
            await this.applyAuthHeaders();

            // Set the thread ID and messages on the agent
            this.agent.threadId = this._session.threadId;
            const contextMsg = this.maybeBuildContextMessage(this._session.threadId);
            // Tool results must always flow; when sendFullHistory is false the backend rehydrates prior turns.
            const assembled = this._sendFullHistory
                ? (contextMsg ? [contextMsg, ...toolMessages] : toolMessages)
                : (contextMsg ? [contextMsg, ...toolMessages.filter(m => m.role === 'tool')] : toolMessages.filter(m => m.role === 'tool'));
            const outgoing = this._pruneOutboundMessages
                ? this._pruneOutboundMessages(assembled)
                : assembled;
            this.agent.setMessages(outgoing);

            console.info('[AG-UI] RunAgent start (tool results):', {
                threadId: this._session.threadId,
                runId,
                toolMessageCount: toolMessages.length,
                stopAfterToolCall: forwardedProps?.stopAfterToolCall === true,
                outgoingCount: outgoing.length,
            });

            const result = await this.agent.runAgent({
                runId,
                tools,
                context: [],
                forwardedProps
            }, subscriber);

            return result;
        } catch (error) {
            console.error('Tool result submission error:', error);
            this.endRun();
            throw error;
        }
    }

    // Utility methods
    private generateRunId(): string {
        return `run_${Date.now()}_${uuidv4().slice(0, 8)}`;
    }

    private generateThreadId(): string {
        return `thread_${Date.now()}_${uuidv4().slice(0, 8)}`;
    }

    getConfig() {
        return {
            baseUrl: this.baseUrl,
            agentId: this.agentId,
            timeout: this.timeout
        };
    }

}