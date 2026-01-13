import { HttpAgent } from '@ag-ui/client';
import { Message, State, Tool } from '@ag-ui/core';
import { AgentSubscriber, RunAgentResult, Session } from './index';
import { v4 as uuidv4 } from 'uuid';

const STREAM_TIMEOUT_MS = 30000;

export class AgentClient {
    private agent: HttpAgent;
    private baseUrl: string;
    private agentId: string;
    private timeout: number;
    private _session: Session;
    private userEmail?: string; // HubSpot visitor email for tracking

    // Session change callback for React integration
    private onSessionChange?: (session: Session) => void;

    constructor(
        baseUrl: string = 'http://localhost:8000',
        agentId: string = '6f6ceaa3-31ca-43ad-a302-2a25bbd8bba9'
    ) {
        this.baseUrl = baseUrl;
        this.agentId = agentId;
        this.timeout = STREAM_TIMEOUT_MS;

        // Construct URL based on agentId (agentId might be a guid, but
        // could be system-defined string like 'smarketing')
        console.log('Creating AgentClient for agent', agentId)
        // TODO: remove the legacy option later
        //const agentUrl = `${baseUrl}/agent/${agentId}`;
        const agentUrl = agentId === 'smarketing' ? `${baseUrl}/${agentId}` : `${baseUrl}/agent/${agentId}`;

        this.agent = new HttpAgent({
            url: agentUrl,
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

    // Set user email for tracking (used when HubSpot visitor context is loaded)
    setUserEmail(email: string | undefined) {
        this.userEmail = email;
        console.log('[AgentClient] User email set for tracking:', email);
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

            // Forward user email for AI usage tracking
            const forwardedProps: Record<string, any> = {};
            if (this.userEmail) {
                forwardedProps.user_email = this.userEmail;
            }

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

    async submitToolResults(
        toolMessages: Message[],
        subscriber: AgentSubscriber
    ): Promise<RunAgentResult> {
        if (!this._session.threadId) {
            throw new Error('Thread ID is required for tool result submission');
        }

        console.log('submitting tool results to backend', toolMessages)

        // Generate new run ID for continuation
        const runId = this.generateRunId();
        
        try {
            // Set the thread ID and messages on the agent
            this.agent.threadId = this._session.threadId;            
            this.agent.setMessages(toolMessages);
            const result = await this.agent.runAgent({
                runId,
                tools: [], // No new tools needed for continuation
                context: [],
                forwardedProps: {}
            }, subscriber);

            return result;
        } catch (error) {
            console.error('Tool result submission error:', error);
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

    /**
     * Upload files to the agent's upload endpoint
     * @param files Array of File objects to upload
     * @param threadId Optional thread ID (will use current session or generate new one)
     * @returns Upload response with artifacts
     */
    async uploadFile(files: File[], threadId?: string): Promise<{ artifacts: any[]; thread_id: string }> {
        // Ensure we have a thread ID
        const uploadThreadId = threadId || this._session.threadId || this.generateThreadId();

        // Update session with thread ID if not already set
        if (!this._session.threadId) {
            this.updateSession({ threadId: uploadThreadId });
        }

        const formData = new FormData();
        // Append all files under the same "files" field; most backends accept this as an array
        files.forEach((file) => formData.append('files', file));
        formData.append('thread_id', uploadThreadId);

        // TODO: remove legacy path later
        // const response = await fetch(`${this.baseUrl}/agent/upload`, {
        const url = this.agentId === '6f6ceaa3-31ca-43ad-a302-2a25bbd8bba9' ? `${this.baseUrl}/smarketing/upload` : `${this.baseUrl}/agent/upload`
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Upload failed (${response.status}): ${text}`);
        }

        // Parse JSON response
        const uploadResponse = await response.json();
        console.log('Files uploaded successfully', uploadResponse);

        return uploadResponse;
    }

}