import { HttpAgent } from '@ag-ui/client';
import { Message, Tool } from '@ag-ui/core';
import { AgentSubscriber, RunAgentResult } from '../types/index';
import { v4 as uuidv4 } from 'uuid';

export class AgentService {
  private agent: HttpAgent;
  private baseUrl: string;
  private timeout: number;

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
  }

  async runAgent(
    messages: Message[], 
    tools: Tool[], 
    subscriber: AgentSubscriber,
    sessionState: { threadId: string | null; runId: string | null }
  ): Promise<RunAgentResult> {
    // Generate IDs if not provided
    const threadId = sessionState.threadId || `thread_${Date.now()}`;
    const runId = sessionState.runId || this.generateRunId();

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
      throw error;
    }
  }

  async submitToolResult(
    toolMessage: Message,
    subscriber: AgentSubscriber,
    sessionState: { threadId: string | null; runId: string | null }
  ): Promise<RunAgentResult> {
    if (!sessionState.threadId) {
      throw new Error('Thread ID is required for tool result submission');
    }

    // Generate new run ID for continuation
    const runId = this.generateRunId();

    try {
      // Set the thread ID and messages on the agent
      this.agent.threadId = sessionState.threadId;
      this.agent.setMessages([toolMessage]);

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

  async executeBackendTool(
    toolCall: { toolCallId: string; toolName: string; args: any },
    subscriber: AgentSubscriber,
    sessionState: { threadId: string | null; runId: string | null }
  ): Promise<RunAgentResult> {
    if (!sessionState.threadId) {
      throw new Error('Thread ID is required for backend tool execution');
    }

    // Generate new run ID for tool execution
    const runId = this.generateRunId();

    try {
      // Create a ToolMessage that represents the tool call to be executed
      const toolCallMessage: Message = {
        id: `tool_call_${toolCall.toolCallId}`,
        role: 'tool',
        content: JSON.stringify(toolCall.args),
        toolCallId: toolCall.toolCallId
      };

      // Set the thread ID and messages on the agent
      this.agent.threadId = sessionState.threadId;
      this.agent.setMessages([toolCallMessage]);

      const result = await this.agent.runAgent({
        runId,
        tools: [], // Backend tools are already registered on the server
        context: [],
        forwardedProps: {}
      }, subscriber);

      return result;
    } catch (error) {
      console.error('Backend tool execution error:', error);
      throw error;
    }
  }

  private generateRunId(): string {
    return `run_${Date.now()}_${uuidv4().slice(0, 8)}`;
  }

  // Utility method to generate thread ID
  generateThreadId(): string {
    return `thread_${Date.now()}_${uuidv4().slice(0, 8)}`;
  }

  // Get current configuration
  getConfig() {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout
    };
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}