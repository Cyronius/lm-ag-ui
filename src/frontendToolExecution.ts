import type { Message } from '@ag-ui/client';
import { ToolDefinition } from './types';

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
 * The handler's return is `await`ed, so a handler may be synchronous
 * (`string | null`) or asynchronous (`Promise<string | null>`) — both flow
 * through the same path (`await` on a non-Promise resolves to the value). A
 * rejected Promise is caught exactly like a synchronous throw. Hence this
 * function is async and returns a Promise.
 *
 * Side effects (dispatching the message, invoking `onResult`) are left to the
 * caller so this stays unit-testable. `nowMs` is injected for a deterministic id.
 */
export async function executeFrontendToolCall(
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
): Promise<FrontendToolExecution> {
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
        // Await normalizes sync and async handlers; a rejected Promise lands in
        // the catch below, identical to a synchronous throw.
        const result = await tool?.handler?.(args, ctx.updateState, ctx.getState, tool.configJson, handlerCtx);
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
