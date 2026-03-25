import React from 'react';

// Import AG-UI types from @ag-ui/client to avoid version mismatch with @ag-ui/core
import type {
    AgentSubscriber,
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
} from '@ag-ui/client';
import { AgentClient } from './AgentClient';
import type { TokenProvider, AgentClientOptions } from './AgentClient';
import { AgentProvider, useAgentContext } from './AgentClientContext';
import { useAgent } from './useAgent';
import { loadAgentConfig } from './configService';

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
} from '@ag-ui/client';
export { EventType } from '@ag-ui/client';
export interface Session {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
}

export { HttpAgent } from '@ag-ui/client';
export type { AgentSubscriber, RunAgentResult } from '@ag-ui/client';

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


// Tool handler executes the tool's logic (frontend tools only)
export type ToolHandler = (
    args: any,
    updateState: (toolName: string, data: any) => void,
    getState: (toolName?: string) => any,
    configJson?: Record<string, any>
) => string | null;

// Tool renderer handles display/artifacts for the tool result (both frontend and backend)
export type ToolRenderer = (
    args: any,
    result: string,
    updateState: (toolName: string, data: any) => void,
    getState: (toolName?: string) => any,
    configJson?: Record<string, any>
) => React.ReactElement | void;

// Tool onResult callback for side effects when tool result is received (e.g., state accumulation)
export type ToolOnResult = (args: any, result: string, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) => void;

export interface ToolDefinition {
    definition: StandardTool;
    handler?: ToolHandler;  // Only for frontend tools
    renderer?: ToolRenderer; // For tools that need special rendering
    onResult?: ToolOnResult; // For side effects when result is received (e.g., accumulation)
    isFrontend: boolean;
    configJson?: Record<string, any>;  // Tool configuration from database
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
    invokeToolByName: (toolName: string, additionalForwardedProps?: Record<string, any>, stateUpdates?: Record<string, any>) => Promise<void>;
    terminateRun: () => void;
    // Debug mode for LLM input capture
    debug: boolean;
    setDebug: (enabled: boolean) => void;
    getForwardedProps: (extraProps?: Record<string, any>) => Record<string, any>;
}



// Callback type for building forwardedProps at provider level
export type ForwardedPropsBuilder = () => Record<string, any>;

export interface UseAgentOptions {
    baseUrl?: string;
    agentId: string;
    tokenProvider?: TokenProvider;
    timeout?: number;
    tools?: Record<string, ToolDefinition>;
    buildForwardedProps?: ForwardedPropsBuilder;
}

export interface AgentProviderProps {
    value: AgentClientContextValue;
    children: React.ReactNode;
}

export interface Suggestion {
	isPriority: boolean;
	suggestion: string;
}

export interface ToolConfigResponse {
    name: string;
    displayName?: string;
    description?: string;
    isFrontend?: boolean;
    configJson?: Record<string, any>;
    parameters?: {
        type: string;
        properties: Record<string, any>;
        required: string[];
    };
}

export interface AgentConfig {
    tools?: Record<string, ToolDefinition>;
    toolConfigs?: ToolConfigResponse[];  // Raw tool configs from API
    suggestions: Suggestion[];
    defaultPlaceholder?: string;
    allowUpload?: boolean;
    config?: Record<string, string | null>;  // Agent config key-value pairs from backend
}

export type { TokenProvider, AgentClientOptions };
export { AgentClient, AgentProvider, useAgentContext, useAgent, loadAgentConfig };
export { useAgentSetup } from './useAgentSetup';
export type { UseAgentSetupOptions, UseAgentSetupResult } from './useAgentSetup';
