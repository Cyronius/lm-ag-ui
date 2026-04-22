import { HttpAgent, AgentSubscriber, Message, State, Tool } from '@ag-ui/client';
import type { RunAgentResult } from '@ag-ui/client';
import { CustomHttpAgent } from './CustomHttpAgent';
import type { RequestHandler } from './CustomHttpAgent';
import { Session } from './index';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TIMEOUT_MS = 300000;

export type TokenProvider = () => Promise<string | null>;

export interface AgentClientOptions {
    tokenProvider?: TokenProvider;
    requestHandler?: RequestHandler;
    timeout?: number;
    sendFullHistory?: boolean;
    initialThreadId?: string;
    /** When true, forwardedProps are also injected as a system message prepended to the messages array.
     *  Useful for backends that don't read forwardedProps from RunAgentInput. Default: false. */
    injectForwardedPropsAsSystemMessage?: boolean;
}

export class AgentClient {
    private agent: HttpAgent;
    private baseUrl: string;
    private agentId: string;
    private timeout: number;
    private tokenProvider?: TokenProvider;
    private requestHandler?: RequestHandler;
    private _session: Session;
    private _debug: boolean = false;
    private _sendFullHistory: boolean;
    private _injectForwardedPropsAsSystemMessage: boolean;

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
        this._injectForwardedPropsAsSystemMessage = options?.injectForwardedPropsAsSystemMessage ?? false;

        this.agent = this.createAgent();

        // Initialize session
        this._session = {
            threadId: options?.initialThreadId ?? null,
            runId: null,
            isActive: false
        };
    }

    // Build agent URL with optional debug query param
    private buildAgentUrl(): string {
        const base = `${this.baseUrl}/agent/${this.agentId}`;
        return this._debug ? `${base}?debug=true` : base;
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

    // Set debug mode - recreates HttpAgent with updated URL
    setDebug(enabled: boolean): void {
        if (this._debug === enabled) return;
        this._debug = enabled;
        this.agent = this.createAgent();
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

        this.updateSession(newSession);
        return this.session;
    }

    endRun(): void {
        this.updateSession({
            runId: null,
            isActive: false
        });
    }

    abortRun(): void {
        this.agent.abortRun();
        this.agent.abortController = new AbortController();
        this.endRun();
    }

    endSession(): void {
        this.updateSession({
            threadId: null,
            runId: null,
            isActive: false
        });
    }

    /**
     * Build a SystemMessage from forwardedProps to inject context into the LLM.
     * The backend reads messages[0] as SystemMessage and appends to agent instruction.
     */
    private buildContextMessage(forwardedProps: Record<string, any>): Message | null {
        if (!forwardedProps || Object.keys(forwardedProps).length === 0) return null;
        return {
            id: `system_context_${Date.now()}`,
            role: 'system',
            content: JSON.stringify(forwardedProps, null, 2)
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
            const contextMsg = this._injectForwardedPropsAsSystemMessage
                ? this.buildContextMessage(forwardedProps) : null;
            // When sendFullHistory is false, backend owns history rehydration — send only the newest turn.
            const outgoing = this._sendFullHistory
                ? (contextMsg ? [contextMsg, ...messages] : messages)
                : [contextMsg, messages[messages.length - 1]].filter(Boolean) as Message[];
            this.agent.setMessages(outgoing);

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

    async submitToolResults(
        toolMessages: Message[],
        subscriber: AgentSubscriber,
        tools: Tool[] = [],
        forwardedProps: Record<string, any> = {}
    ): Promise<RunAgentResult> {
        if (!this._session.threadId) {
            throw new Error('Thread ID is required for tool result submission');
        }

        console.info('submitting tool results to backend', toolMessages)

        // Generate new run ID for continuation
        const runId = this.generateRunId();

        try {
            await this.applyAuthHeaders();

            // Set the thread ID and messages on the agent
            this.agent.threadId = this._session.threadId;
            const contextMsg = this._injectForwardedPropsAsSystemMessage
                ? this.buildContextMessage(forwardedProps) : null;
            // Tool results must always flow; when sendFullHistory is false the backend rehydrates prior turns.
            const outgoing = this._sendFullHistory
                ? (contextMsg ? [contextMsg, ...toolMessages] : toolMessages)
                : (contextMsg ? [contextMsg, ...toolMessages.filter(m => m.role === 'tool')] : toolMessages.filter(m => m.role === 'tool'));
            this.agent.setMessages(outgoing);
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

    // async executeBackendTool(
    //     toolCall: { toolCallId: string; toolName: string; args: any },
    //     subscriber: AgentSubscriber
    // ): Promise<RunAgentResult> {
    //     if (!this._session.threadId) {
    //         throw new Error('Thread ID is required for backend tool execution');
    //     }

    //     // Generate new run ID for tool execution
    //     const runId = this.generateRunId();

    //     try {
    //         // Create a ToolMessage that represents the tool call to be executed
    //         const toolCallMessage: Message = {
    //             id: `tool_call_${toolCall.toolCallId}`,
    //             role: 'tool',
    //             content: JSON.stringify(toolCall.args),
    //             toolCallId: toolCall.toolCallId
    //         };

    //         // Set the thread ID and messages on the agent
    //         this.agent.threadId = this._session.threadId;
    //        // this.agent.setMessages([toolCallMessage]);
    //         const result = await this.agent.runAgent({
    //             runId,
    //             tools: [], // Backend tools are already registered on the server
    //             context: [],
    //             forwardedProps: {}
    //         }, subscriber);

    //         return result;            
    //     } catch (error) {
    //         console.error('Backend tool execution error:', error);
    //         throw error;
    //     }
    // }

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