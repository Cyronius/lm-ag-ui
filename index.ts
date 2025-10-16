import React from 'react';

// Import AG-UI types for local use
import type {
    Message,
    Tool,
    RunAgentInput,
    BaseEvent,
    TextMessageStartEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
    StateSnapshotEvent
} from '@ag-ui/core';
import { AgentClient } from './AgentClient';
import { AgentClientProvider, useAgentContext } from './AgentClientContext';

// AG-UI Types - Re-export from @ag-ui/core (which is re-exported by @ag-ui/client)
export type {
    Message,
    Tool,
    RunAgentInput,
    BaseEvent,
    TextMessageStartEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent
} from '@ag-ui/core';
export { EventType } from '@ag-ui/core';
export interface Session {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
}

export { HttpAgent } from '@ag-ui/client';

// Custom types for our application
export interface ChatInterfaceProps {
    onBack?: () => void;
}

export interface ChatSuggestionsProps {
    onSuggestionClick: (suggestion: string) => void;
}


export interface ToolCallBuffer {
    name: string;
    argsBuffer: string;
    parentMessageId?: string;    
}

export interface ArtifactData {
    type: string;
    [key: string]: any;
}

// Tool handler types are now defined in unifiedTools.ts

export interface StandardTool {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required: string[];
    };
}

export interface RunAgentResult {
    result: any;
    newMessages: Message[];
}

export interface AgentSubscriber {
    onRunStartedEvent?(params: { event: RunStartedEvent }): void;
    onTextMessageContentEvent?(params: { event: TextMessageContentEvent }): void;
    onRunFinishedEvent?(params: { event: RunFinishedEvent }): void;
    onRunErrorEvent?(params: { event: RunErrorEvent }): void;
    onToolCallStartEvent?(params: { event: ToolCallStartEvent }): void;
    onToolCallArgsEvent?(params: { event: ToolCallArgsEvent }): void;
    onToolCallEndEvent?(params: { event: ToolCallEndEvent }): void;
    onToolCallResultEvent?(params: { event: ToolCallResultEvent }): void;
    onStateSnapshotEvent?(params: { event: StateSnapshotEvent }): void;
    onEvent?(params: { event: BaseEvent }): void;
}

// Tool handler executes the tool's logic (frontend tools only)
export type ToolHandler = (args: any, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) => string;

// Tool renderer handles display/artifacts for the tool result (both frontend and backend)
export type ToolRenderer = (args: any, result: string, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) => React.ReactElement | void;

export interface ToolDefinition {
    definition: StandardTool;
    handler?: ToolHandler;  // Only for frontend tools
    renderer?: ToolRenderer; // For tools that need special rendering
    isFrontend: boolean;
}


export interface AgentClientContextValue {
    agentClient: AgentClient;
    session: Session;
    tools: Record<string, ToolDefinition>;
    globalState: any;
    messages: Message[];
    addMessage: (message: Message) => void;
    clearMessages: () => void;
    updateState: (toolName: string, data: any) => void;    
    // Streaming state
    currentMessage: string;
    currentMessageId: string | null;
    isStreaming: boolean;    
    getToolNameFromCallId: (toolCallId: string) => string | undefined;    
    agentSubscriber: AgentSubscriber;
}



export interface AgentClientProviderProps {
    children: React.ReactNode;
    tools: Record<string, ToolDefinition>;
}

export { AgentClient, AgentClientProvider, useAgentContext };
