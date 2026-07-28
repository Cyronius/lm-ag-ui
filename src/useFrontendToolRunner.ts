import { useEffect, useMemo, useRef } from 'react';
import type { Message } from '@ag-ui/client';
import { v4 as uuidv4 } from 'uuid';
import { SessionHandle } from './useAgentSession';
import { StreamHandle, RunFinishedPayload } from './useAgentStream';
import { ToolDefinition, ForwardedPropsBuilder } from './index';
import { getFrontEndTools } from './toolUtils';
import { executeFrontendToolCall } from './frontendToolExecution';

export type { FrontendToolExecution } from './frontendToolExecution';
export { executeFrontendToolCall };

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

    // Reentrancy guard. Handlers are awaited, so there is now a window between a
    // RUN_FINISHED and the submitToolResults that starts the next run. A second
    // RUN_FINISHED arriving in that window must not re-process the not-yet-cleared
    // tool buffers. The flag early-returns the overlapping invocation.
    const isProcessingRef = useRef(false);

    useEffect(() => {
        const unsub = stream.onRunFinished((_payload: RunFinishedPayload) => {
            // The subscriber callback is sync; drive the async runner and route any
            // unexpected rejection to a visible assistant message.
            void handlePendingToolCalls().catch((error: unknown) => {
                stream.dispatch({ type: 'ADD_MESSAGE', message: { id: uuidv4(), role: 'assistant', content: `${error}` } });
            });
        });
        return unsub;

        // Scoped per run — flag bookkeeping lives inside the runner.
        async function handlePendingToolCalls() {
            if (isProcessingRef.current) return;
            isProcessingRef.current = true;

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

            const executeFrontendTool = async (toolName: string, argsJson: string | null, toolCallId: string): Promise<Message | null> => {
                const tool = frontEndToolsRef.current[toolName];
                // Always yields a result message — a parse failure or a handler
                // throw/rejection becomes an { ok: false } tool result rather than
                // a stray assistant message with no result submitted for the call.
                const { message, args, result, executed } = await executeFrontendToolCall(
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
                // Sequential await preserves message ordering and the
                // stopAfterToolCall / onResult semantics across multiple pending
                // calls (Promise.all is intentionally avoided here).
                for (const [toolCallId, toolCall] of stateRef.current.toolCallBuffers.entries()) {
                    if (toolCall.resultReceived) continue;
                    let result: Message | null = null;
                    if (frontEndToolsRef.current[toolCall.name]) {
                        result = await executeFrontendTool(toolCall.name, toolCall.argsBuffer, toolCallId);
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
                isProcessingRef.current = false;
            }
        }
    }, [stream, session]);
}
