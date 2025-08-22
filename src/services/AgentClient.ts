import { HttpAgent } from '@ag-ui/client';
import { Message, State, Tool } from '@ag-ui/core';
import { AgentSubscriber, RunAgentResult } from '../types/index';
import { v4 as uuidv4 } from 'uuid';

interface Session {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
}

export class AgentClient {
    private agent: HttpAgent;
    private baseUrl: string;
    private timeout: number;
    private _session: Session;

    // Session change callback for React integration
    private onSessionChange?: (session: Session) => void;

    constructor() {
        this.baseUrl = `${import.meta.env.VITE_PYTHON_SERVER_URL || 'http://localhost:8000'}/smarketing`;
        this.timeout = parseInt(import.meta.env.VITE_STREAM_TIMEOUT || '30000');

        this.agent = new HttpAgent({
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            }
        });

        // Initialize session
        this._session = {
            threadId: null,
            runId: null,
            isActive: false
        };
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

    endSession(): void {
        this.updateSession({
            threadId: null,
            runId: null,
            isActive: false
        });
    }

    // Agent communication methods
    async runAgent(
        messages: Message[],
        tools: Tool[],
        subscriber: AgentSubscriber
    ): Promise<RunAgentResult> {
        // Use current session (always fresh)
        const threadId = this._session.threadId || this.generateThreadId();
        const runId = this._session.runId || this.generateRunId();

        try {
            // Set the thread ID and messages on the agent
            this.agent.threadId = threadId;
            this.agent.setMessages(messages);
            const result = await this.agent.runAgent({
                runId,
                tools,
                context: [],
                forwardedProps: {}
            }, subscriber);

            return result;
        } catch (error) {
            console.error('Agent execution error:', error);
            this.endRun();
            throw error;
        }
    }
    
    setState(state: State) {
        this.agent.setState(state)        
    }

    // async submitToolResult(
    //     toolMessage: Message,
    //     subscriber: AgentSubscriber
    // ): Promise<RunAgentResult> {
    //     if (!this._session.threadId) {
    //         throw new Error('Thread ID is required for tool result submission');
    //     }

    //     // Generate new run ID for continuation
    //     const runId = this.generateRunId();

    //     try {
    //         // Set the thread ID and messages on the agent
    //         this.agent.threadId = this._session.threadId;            
    //         this.agent.setMessages([toolMessage]);
    //         const result = await this.agent.runAgent({
    //             runId,
    //             tools: [], // No new tools needed for continuation
    //             context: [],
    //             forwardedProps: {}
    //         }, subscriber);

    //         return result;
    //     } catch (error) {
    //         console.error('Tool result submission error:', error);
    //         throw error;
    //     }
    // }

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
            timeout: this.timeout
        };
    }

}