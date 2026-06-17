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


// Per-invocation context passed to frontend tool handlers.
//
// ctx.stopAfterToolCall() — sets `forwardedProps.stopAfterToolCall = true` on
// the next tool-result submission. Backend short-circuits the LLM entirely
// (no follow-up turn). Use only when the tool output IS the final answer.
// Backend spec: AGENT-STOP-FRONTEND-CONTEXT.
//
// stopAfterToolCall is idempotent and batch-scoped — if any tool in a batched
// tool-result submission sets the flag, it applies to the whole submission.
//
// To suppress *intermediate* assistant narration during an agentic chain (so
// only the first and final assistant messages of the user's turn are shown),
// set `suppressIntermediateAssistantMessages: true` on `UseAgentSetupOptions`
// or `UseAgentOptions`. That flag is sticky for the lifetime of the agent
// component and is FE-local (does not cross the wire).
export interface ToolContext {
    readonly toolCallId: string;
    readonly toolName: string;
    stopAfterToolCall(): void;
}

// Tool handler executes the tool's logic (frontend tools only).
// `ctx` is optional for backward compatibility — existing handlers that
// ignore it continue to work.
//
// A handler may return its result synchronously (`string | null`) OR
// asynchronously (`Promise<string | null>`). The runner awaits the return, so
// both forms are handled by the same code path — a sync tool needs no change,
// and an async tool (e.g. one that fetches) opts in simply by being declared
// `async`. See useFrontendToolRunner.executeFrontendToolCall.
export type ToolHandler = (
    args: any,
    updateState: (toolName: string, data: unknown) => void,
    getState: (toolName?: string) => unknown,
    configJson?: Record<string, unknown>,
    ctx?: ToolContext
) => string | null | Promise<string | null>;

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
    setMessages: (messages: Message[]) => void;
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
    // Debug mode for LLM input capture (read-only; set via UseAgentOptions.debug at init)
    debug: boolean;
    getForwardedProps: (extraProps?: Record<string, any>) => Record<string, any>;
    /**
     * Defensive: clears any pending chained-run marker. Consumers calling
     * `agentClient.runAgent` directly to start a fresh user-initiated run
     * while `suppressIntermediateAssistantMessages` is enabled should call
     * this first. `useAgent.invokeToolByName` calls it automatically.
     * No-op when `suppressIntermediateAssistantMessages` is off.
     */
    clearPendingChain: () => void;
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
    /** Enable backend LLM-input capture by appending `?debug=true` to the agent URL.
     *  Set once at init (drive from env var or URL flag); not runtime-toggleable. */
    debug?: boolean;
    /** Called for run errors, timeouts, and aborts. Additive to the existing in-stream
     *  error-message behavior. */
    onError?: (err: { code: 'run_error' | 'timeout' | 'aborted'; message: string; raw?: unknown }) => void;
    /** Safety timeout in ms. After this elapses with an active run, the run is forcibly
     *  aborted and a timeout message is added. Default: 300_000 (5 min). */
    safetyTimeoutMs?: number;
    /** Optional outbound-message transformer applied by AgentClient on every wire send
     *  (runAgent + submitToolResults), immediately before agent.setMessages. Use for
     *  context shrinking such as tombstoning stale tool results. Must preserve
     *  ordering and tool-call/tool-result pairing — only `content` may change. */
    pruneOutboundMessages?: (messages: Message[]) => Message[];
    /** When true, suppress *intermediate* assistant narration during an agentic
     *  chain. The first text emitted in a user turn (the first TEXT_MESSAGE_*
     *  group seen since the user submitted) streams normally. The final text
     *  (text in the run that does not chain another tool call) is committed at
     *  RUN_FINISHED. Any text emitted in an intermediate run that chains
     *  another tool call after itself is dropped. FE-local — does not cross
     *  the wire. Default: false. */
    suppressIntermediateAssistantMessages?: boolean;
    /** Extra query params appended to BOTH the config-init GET and every run
     *  POST (`/agent/{agentId}`). Array values are sent as repeated keys
     *  (`?kbIds=a&kbIds=b`). Used for per-session backend tool selection such as
     *  course knowledge bases (MOBI-KB-TOOL): the config GET reports the tool and
     *  the run POST attaches it. Stable for the session. */
    configParams?: Record<string, string | string[]>;
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

/** @advanced Lower-level building block. Most consumers should use `useAgent`. */
export { useAgentSession } from './useAgentSession';
export type { SessionHandle } from './useAgentSession';

/** @advanced Lower-level building block. Most consumers should use `useAgent`. */
export { useAgentStream } from './useAgentStream';
export type { StreamHandle, RunFinishedPayload, PendingToolCall } from './useAgentStream';

/** @advanced Lower-level building block. Most consumers should use `useAgent`. */
export { useFrontendToolRunner } from './useFrontendToolRunner';
export type { FrontendToolRunnerOptions } from './useFrontendToolRunner';
export { filesToBinaryContent } from './fileUtils';
export { getAllToolDefinitions, getFrontendToolDefinitions, getBackendToolDefinitions, getFrontEndTools, getToolRenderers, hydrateToolConfigs } from './toolUtils';
export { loadAgentConfig } from './configService';
export { useAgentSetup } from './useAgentSetup';
export type { UseAgentSetupOptions, UseAgentSetupResult } from './useAgentSetup';
