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
                try {
                    const args = argsJson ? JSON.parse(argsJson) : null;
                    const tool = frontEndToolsRef.current[toolName];
                    const ctx = {
                        toolCallId,
                        toolName,
                        stopAfterToolCall: () => { stopAfterToolCall = true; },
                    };
                    const result = tool.handler?.(args, updateState, getState, tool.configJson, ctx);
                    const toolMessage: Message = {
                        id: `tool_${toolCallId}_${Date.now()}`,
                        role: 'tool',
                        content: result || '{}',
                        toolCallId,
                    };
                    dispatch({ type: 'ADD_MESSAGE', message: toolMessage });
                    if (tool.onResult) {
                        try {
                            tool.onResult(args, result || '', updateState, getState);
                        } catch (error) {
                            console.error(`Error calling onResult for tool ${toolName}:`, error);
                        }
                    }
                    return toolMessage;
                } catch (error) {
                    console.error(`Tool execution error for ${toolName}:`, error);
                    const errorDetail = error instanceof Error ? error.message : String(error);
                    addErrorMessage(`Error executing tool '${toolName}': ${errorDetail}`);
                    return null;
                }
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
                    // turn-scoped state (firstTextEmittedThisTurnRef, buffers)
                    // is preserved across the agentic chain.
                    stream.chainedRunRef.current = true;
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
