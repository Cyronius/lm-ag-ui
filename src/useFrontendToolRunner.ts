import { useEffect, useMemo, useRef } from 'react';
import type { Message } from '@ag-ui/client';
import { v4 as uuidv4 } from 'uuid';
import { SessionHandle } from './useAgentSession';
import { StreamHandle, RunFinishedPayload } from './useAgentStream';
import { ToolDefinition, ForwardedPropsBuilder } from './index';
import { getFrontEndTools } from './toolUtils';

export interface FrontendToolRunnerOptions {
    buildForwardedProps?: ForwardedPropsBuilder;
}

export interface FrontendToolExecution {
    /**
     * The `role: 'tool'` result message to submit back to the agent. Always
     * produced for a frontend tool call — including when arg parsing fails or
     * the handler throws — so the agent protocol stays whole (no dangling
     * tool_call) and the model receives a structured failure it can react to.
     */
    message: Message;
    /** Parsed tool args, or `undefined` when JSON parsing failed. */
    args: unknown;
    /** The handler's raw return value; `undefined` if the handler threw. */
    result: string | null | undefined;
    /** True when the handler ran to completion (did not throw). Gates `onResult`. */
    executed: boolean;
}

/**
 * Run one frontend tool call and build its result message. Pure with respect to
 * control flow — it never throws: a JSON-parse failure or a handler exception is
 * caught and turned into an `{ ok: false, error }` tool-result message, mirroring
 * the existing invalid-args path. This is what guarantees a thrown handler is
 * surfaced to the model as a real tool result (and counted by any failure
 * circuit breaker) instead of leaking out as a stray assistant message with no
 * result submitted for the call.
 *
 * Side effects (dispatching the message, invoking `onResult`) are left to the
 * caller so this stays unit-testable. `nowMs` is injected for a deterministic id.
 */
export function executeFrontendToolCall(
    tool: ToolDefinition | undefined,
    toolName: string,
    argsJson: string | null,
    toolCallId: string,
    ctx: {
        updateState: (toolName: string, data: unknown) => void;
        getState: (toolName?: string) => unknown;
        stopAfterToolCall: () => void;
    },
    nowMs: number
): FrontendToolExecution {
    const mkMessage = (content: string): Message => ({
        id: `tool_${toolCallId}_${nowMs}`,
        role: 'tool',
        content,
        toolCallId,
    });

    let args: unknown;
    try {
        args = argsJson ? JSON.parse(argsJson) : null;
    } catch (parseError) {
        const detail = parseError instanceof Error ? parseError.message : String(parseError);
        console.error(`Invalid JSON args for tool ${toolName}:`, parseError, { raw: argsJson });
        return {
            message: mkMessage(JSON.stringify({ ok: false, error: 'invalid_tool_args', message: detail, raw: argsJson })),
            args: undefined,
            result: undefined,
            executed: false,
        };
    }

    try {
        const handlerCtx = {
            toolCallId,
            toolName,
            stopAfterToolCall: ctx.stopAfterToolCall,
        };
        const result = tool?.handler?.(args, ctx.updateState, ctx.getState, tool.configJson, handlerCtx);
        return { message: mkMessage(result || '{}'), args, result, executed: true };
    } catch (error) {
        console.error(`Tool execution error for ${toolName}:`, error);
        const detail = error instanceof Error ? error.message : String(error);
        return {
            message: mkMessage(JSON.stringify({ ok: false, error: 'tool_execution_error', message: detail })),
            args,
            result: undefined,
            executed: false,
        };
    }
}

/**
 * Effect-only hook. Subscribes to stream.onRunFinished and, for each pending
 * tool call that has a frontend handler, executes it, dispatches the tool
 * message, and submits the batched tool results back to the agent.
 */
export function useFrontendToolRunner(
    stream: StreamHandle,
    session: SessionHandle,
    tools: Record<string, ToolDefinition>,
    options: FrontendToolRunnerOptions = {}
): void {
    const { buildForwardedProps } = options;

    const frontEndTools = useMemo(() => getFrontEndTools(tools), [tools]);

    // Keep latest bindings in refs so the onRunFinished subscription stays stable.
    const toolsRef = useRef(tools);
    const frontEndToolsRef = useRef(frontEndTools);
    const buildFwdRef = useRef(buildForwardedProps);
    toolsRef.current = tools;
    frontEndToolsRef.current = frontEndTools;
    buildFwdRef.current = buildForwardedProps;

    useEffect(() => {
        const unsub = stream.onRunFinished((_payload: RunFinishedPayload) => {
            handlePendingToolCalls();
        });
        return unsub;

        // Scoped per run — flag bookkeeping lives inside the runner.
        function handlePendingToolCalls() {
            let stopAfterToolCall = false;
            const toolMessages: Message[] = [];
            const dispatch = stream.dispatch;
            const stateRef = stream.stateRef;

            const addErrorMessage = (error: unknown) => {
                dispatch({ type: 'ADD_MESSAGE', message: { id: uuidv4(), role: 'assistant', content: `${error}` } });
            };

            const updateState = (toolName: string, data: unknown) =>
                dispatch({ type: 'UPDATE_TOOL_STATE', toolName, data });
            const getState = (toolName?: string) =>
                toolName ? stateRef.current.globalState[toolName] : stateRef.current.globalState;

            const executeFrontendTool = (toolName: string, argsJson: string | null, toolCallId: string): Message | null => {
                const tool = frontEndToolsRef.current[toolName];
                // Always yields a result message — a parse failure or a handler
                // throw becomes an { ok: false } tool result rather than a stray
                // assistant message with no result submitted for the call.
                const { message, args, result, executed } = executeFrontendToolCall(
                    tool,
                    toolName,
                    argsJson,
                    toolCallId,
                    { updateState, getState, stopAfterToolCall: () => { stopAfterToolCall = true; } },
                    Date.now()
                );
                dispatch({ type: 'ADD_MESSAGE', message });
                if (executed && tool.onResult) {
                    try {
                        tool.onResult(args, result || '', updateState, getState);
                    } catch (error) {
                        console.error(`Error calling onResult for tool ${toolName}:`, error);
                    }
                }
                return message;
            };

            try {
                for (const [toolCallId, toolCall] of stateRef.current.toolCallBuffers.entries()) {
                    if (toolCall.resultReceived) continue;
                    let result: Message | null = null;
                    if (frontEndToolsRef.current[toolCall.name]) {
                        result = executeFrontendTool(toolCall.name, toolCall.argsBuffer, toolCallId);
                    } else {
                        console.warn(`[AG-UI] Tool '${toolCall.name}' is not a frontend tool and has no backend result — skipping`);
                    }
                    if (result) toolMessages.push(result);
                }
            } catch (error) {
                addErrorMessage(error);
            } finally {
                dispatch({ type: 'CLEAR_TOOL_BUFFERS' });
                if (toolMessages.length > 0) {
                    const toolDefs = Object.values(toolsRef.current).map((t) => t.definition);
                    session.client.startNewRun();
                    const baseProps = buildFwdRef.current?.() ?? {};
                    const fwd = {
                        ...baseProps,
                        ...(stopAfterToolCall ? { stopAfterToolCall: true } : {}),
                    };
                    // Mark the upcoming run as a continuation so the stream's
                    // turn-scoped suppression state (first-text flag, buffers)
                    // is preserved across the agentic chain.
                    stream.markChainedRun();
                    session.client.submitToolResults(
                        stateRef.current.messages,
                        stream.subscriber,
                        toolDefs,
                        fwd
                    ).catch((error: unknown) => {
                        console.error('Tool result submission failed:', error);
                        session.client.endRun();
                        addErrorMessage(`Failed to submit tool results: ${error}`);
                    });
                }
            }
        }
    }, [stream, session]);
}
