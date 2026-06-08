import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolDefinition } from '../index';
import { executeFrontendToolCall } from '../useFrontendToolRunner';

// Unit coverage for the per-call execution that backs useFrontendToolRunner.
// The behavior under test: a frontend tool call ALWAYS produces a `role: 'tool'`
// result message — including when the args fail to parse or the handler throws —
// so the agent protocol stays whole and the model receives a structured failure
// (counted by a downstream ok:false failure circuit breaker) instead of a stray
// assistant message with no result submitted for the call.

const NOW = 1_700_000_000_000;

const ctx = {
    updateState: vi.fn(),
    getState: vi.fn(),
    stopAfterToolCall: vi.fn(),
};

function makeTool(handler: ToolDefinition['handler'], onResult?: ToolDefinition['onResult']): ToolDefinition {
    return {
        definition: { name: 'do_thing', description: '', parameters: { type: 'object', properties: {} } } as never,
        handler,
        onResult,
        isFrontend: true,
    };
}

function parse(content: string): Record<string, unknown> {
    return JSON.parse(content);
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('executeFrontendToolCall', () => {
    it('returns the handler result as a tool-role message on success', () => {
        const tool = makeTool(() => JSON.stringify({ ok: true, columnId: 'c1' }));
        const { message, result, executed, args } = executeFrontendToolCall(
            tool, 'do_thing', JSON.stringify({ columnId: 'c1' }), 'call_1', ctx, NOW,
        );

        expect(message.role).toBe('tool');
        expect(message.toolCallId).toBe('call_1');
        expect(message.id).toBe(`tool_call_1_${NOW}`);
        expect(parse(message.content as string)).toEqual({ ok: true, columnId: 'c1' });
        expect(executed).toBe(true);
        expect(result).toBe(JSON.stringify({ ok: true, columnId: 'c1' }));
        expect(args).toEqual({ columnId: 'c1' });
    });

    it('surfaces a thrown handler as an ok:false tool message (not a dropped result)', () => {
        const tool = makeTool(() => { throw new Error('boom'); });
        const { message, result, executed } = executeFrontendToolCall(
            tool, 'do_thing', '{}', 'call_2', ctx, NOW,
        );

        // The key regression guard: a throw must yield a tool-role result message,
        // not null and not an assistant message.
        expect(message.role).toBe('tool');
        expect(message.toolCallId).toBe('call_2');
        const body = parse(message.content as string);
        expect(body.ok).toBe(false);
        expect(body.error).toBe('tool_execution_error');
        expect(body.message).toBe('boom');
        expect(executed).toBe(false);
        expect(result).toBeUndefined();
    });

    it('surfaces invalid JSON args as an ok:false tool message', () => {
        const tool = makeTool(() => JSON.stringify({ ok: true }));
        const { message, executed, args } = executeFrontendToolCall(
            tool, 'do_thing', '{not json', 'call_3', ctx, NOW,
        );

        expect(message.role).toBe('tool');
        const body = parse(message.content as string);
        expect(body.ok).toBe(false);
        expect(body.error).toBe('invalid_tool_args');
        expect(body.raw).toBe('{not json');
        expect(executed).toBe(false);
        expect(args).toBeUndefined();
    });

    it('does not invoke the handler when args fail to parse', () => {
        const handler = vi.fn(() => '{}');
        const tool = makeTool(handler);
        executeFrontendToolCall(tool, 'do_thing', '{bad', 'call_4', ctx, NOW);
        expect(handler).not.toHaveBeenCalled();
    });

    it('coerces a falsy handler return to "{}" and still marks executed', () => {
        const tool = makeTool(() => null);
        const { message, executed } = executeFrontendToolCall(
            tool, 'do_thing', '{}', 'call_5', ctx, NOW,
        );
        expect(message.content).toBe('{}');
        // executed=true so the caller still fires onResult, matching prior behavior.
        expect(executed).toBe(true);
    });

    it('passes parsed args, state callbacks, configJson, and a context to the handler', () => {
        const handler = vi.fn(() => '{}');
        const tool: ToolDefinition = { ...makeTool(handler), configJson: { foo: 'bar' } };
        executeFrontendToolCall(tool, 'do_thing', JSON.stringify({ a: 1 }), 'call_6', ctx, NOW);

        expect(handler).toHaveBeenCalledTimes(1);
        const [argsArg, updateStateArg, getStateArg, configArg, ctxArg] = handler.mock.calls[0];
        expect(argsArg).toEqual({ a: 1 });
        expect(updateStateArg).toBe(ctx.updateState);
        expect(getStateArg).toBe(ctx.getState);
        expect(configArg).toEqual({ foo: 'bar' });
        expect(ctxArg).toMatchObject({ toolCallId: 'call_6', toolName: 'do_thing' });
    });

    it('wires ctx.stopAfterToolCall through to the handler context', () => {
        const tool = makeTool((_a, _u, _g, _c, handlerCtx) => { handlerCtx?.stopAfterToolCall(); return '{}'; });
        executeFrontendToolCall(tool, 'do_thing', '{}', 'call_7', ctx, NOW);
        expect(ctx.stopAfterToolCall).toHaveBeenCalledTimes(1);
    });
});
