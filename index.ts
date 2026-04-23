import React from 'react';

import type { AgentSubscriber, Message } from '@ag-ui/client';
import { AgentClient } from './AgentClient';
import type { TokenProvider, SystemContextBuilder } from './AgentClient';
import type { RequestHandler } from './CustomHttpAgent';
import { AgentProvider, useAgentContext } from './AgentClientContext';
import { useAgent } from './useAgent';

export interface Session {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
}

export interface StandardTool {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required: string[];
    };
}


// Per-invocation context passed to frontend tool handlers. Calling
// ctx.stopAfterToolCall() tells the AG-UI harness to include
// `forwardedProps.stopAfterToolCall = true` on the next tool-result
// submission, which the backend honors by marking the resumed tool result
// with stop_after_tool_call=True (no LLM follow-up turn). See backend spec:
// AGENT-STOP-FRONTEND-CONTEXT.
export interface ToolContext {
    readonly toolCallId: string;
    readonly toolName: string;
    // Idempotent. If called by any tool in a batched tool-result submission,
    // the whole submission flags the run to stop.
    stopAfterToolCall(): void;
}

// Tool handler executes the tool's logic (frontend tools only).
// `ctx` is optional for backward compatibility — existing handlers that
// ignore it continue to work.
export type ToolHandler = (
    args: any,
    updateState: (toolName: string, data: unknown) => void,
    getState: (toolName?: string) => unknown,
    configJson?: Record<string, unknown>,
    ctx?: ToolContext
) => string | null;

// Tool renderer handles display/artifacts for the tool result (both frontend and backend)
export type ToolRenderer = (
    args: any,
    result: string,
    updateState: (toolName: string, data: unknown) => void,
    getState: (toolName?: string) => unknown,
    configJson?: Record<string, unknown>
) => React.ReactElement | void;

// Tool onResult callback for side effects when tool result is received (e.g., state accumulation)
export type ToolOnResult = (args: any, result: string, updateState: (toolName: string, data: unknown) => void, getState: (toolName?: string) => unknown) => void;

export interface ToolDefinition {
    definition: StandardTool;
    handler?: ToolHandler;  // Only for frontend tools
    renderer?: ToolRenderer; // For tools that need special rendering
    onResult?: ToolOnResult; // For side effects when result is received (e.g., accumulation)
    isFrontend: boolean;
    configJson?: Record<string, unknown>;  // Tool configuration from database
}


export interface AgentClientContextValue {
    agentClient: AgentClient;
    session: Session;
    tools: Record<string, ToolDefinition>;
    globalState: Record<string, unknown>;
    messages: Message[];
    addMessage: (message: Message) => void;
    clearMessages: () => void;
    updateState: (toolName: string, data: unknown) => void;
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

export type AgentLifecycleEvent =
    | { type: 'run_started' }
    | { type: 'tool_used'; toolName: string }
    | { type: 'message_added'; role: string; content: string };

export interface UseAgentOptions {
    baseUrl?: string;
    agentId: string;
    tokenProvider?: TokenProvider;
    requestHandler?: RequestHandler;
    timeout?: number;
    tools?: Record<string, ToolDefinition>;
    buildForwardedProps?: ForwardedPropsBuilder;
    sendFullHistory?: boolean;
    initialThreadId?: string;
    /** Optional callback for observing agent lifecycle events (e.g., tracking, analytics) */
    onLifecycleEvent?: (event: AgentLifecycleEvent) => void;
    /** Optional zero-arg renderer for the system-context snapshot. When not provided,
     *  no system context is injected. Independent of `buildForwardedProps`. */
    systemContextBuilder?: SystemContextBuilder;
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

export type { TokenProvider, SystemContextBuilder };
export type { RequestHandler };
export { AgentClient, AgentProvider, useAgentContext, useAgent };
export { filesToBinaryContent } from './fileUtils';
export { getAllToolDefinitions, getFrontendToolDefinitions, getBackendToolDefinitions, getFrontEndTools, getToolRenderers } from './toolUtils';
export { loadAgentConfig } from './configService';
export { useAgentSetup } from './useAgentSetup';
export type { UseAgentSetupOptions, UseAgentSetupResult } from './useAgentSetup';
