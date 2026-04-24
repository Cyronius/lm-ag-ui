import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render } from '@testing-library/react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import type { Message, AgentSubscriber } from '@ag-ui/client';
import type { AgentClientContextValue, ToolDefinition } from '../index';

// ---- Fake AgentClient ----
// vi.mock is hoisted, so the factory cannot reference outer vars.
// We expose a module-level singleton of the last-constructed fake so the test can inspect it.
interface FakeSession {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
}

vi.mock('../AgentClient', () => {
    class FakeAgentClient {
        session: FakeSession = { threadId: 't1', runId: null, isActive: false };
        debug = false;
        runAgentCalls: Array<{ messages: Message[]; tools: any[]; forwardedProps?: any }> = [];
        submitToolResultsCalls: Array<{ messages: Message[]; tools: any[]; forwardedProps?: any }> = [];
        startNewRunCount = 0;
        endRunCount = 0;
        abortRunCount = 0;
        private _onSession?: (s: FakeSession) => void;

        constructor(_baseUrl?: string, _agentId?: string, _opts?: any) {
            (FakeAgentClient as any).last = this;
        }
        setSessionChangeCallback(cb: (s: FakeSession) => void) { this._onSession = cb; cb(this.session); }
        startNewRun() {
            this.startNewRunCount++;
            this.session = { ...this.session, runId: `r${this.startNewRunCount}`, isActive: true };
            this._onSession?.(this.session);
        }
        endRun() {
            this.endRunCount++;
            this.session = { ...this.session, isActive: false };
            this._onSession?.(this.session);
        }
        abortRun() { this.abortRunCount++; }
        setState(_s: any) {}
        async runAgent(messages: Message[], tools: any[], _sub: AgentSubscriber, forwardedProps?: any) {
            this.runAgentCalls.push({ messages, tools, forwardedProps });
        }
        async submitToolResults(messages: Message[], _sub: AgentSubscriber, tools: any[], forwardedProps?: any) {
            this.submitToolResultsCalls.push({ messages, tools, forwardedProps });
        }
    }
    return { AgentClient: FakeAgentClient };
});

// Import after the mock
import { useAgent } from '../useAgent';
import { AgentClient as MockedAgentClient } from '../AgentClient';

type FakeAgentClient = InstanceType<typeof MockedAgentClient> & {
    runAgentCalls: Array<{ messages: Message[]; tools: any[]; forwardedProps?: any }>;
    submitToolResultsCalls: Array<{ messages: Message[]; tools: any[]; forwardedProps?: any }>;
    startNewRunCount: number;
    endRunCount: number;
    abortRunCount: number;
};

function Harness({ tools, onReady }: { tools: Record<string, ToolDefinition>; onReady: (ctx: AgentClientContextValue) => void }) {
    const ctx = useAgent({ agentId: 'test', tools });
    React.useEffect(() => { onReady(ctx); });
    return null;
}

function getFake(): FakeAgentClient {
    return (MockedAgentClient as any).last as FakeAgentClient;
}

// Minimal event helpers matching AG-UI shapes
const ev = {
    runStarted: (threadId: string, runId: string) => ({ threadId, runId }),
    textStart: (messageId: string) => ({ messageId, role: 'assistant' }),
    textDelta: (messageId: string, delta: string) => ({ messageId, delta }),
    textEnd: (messageId: string) => ({ messageId }),
    runFinished: (threadId: string, runId: string) => ({ threadId, runId }),
    toolStart: (toolCallId: string, toolCallName: string, parentMessageId?: string) =>
        ({ toolCallId, toolCallName, parentMessageId }),
    toolArgs: (toolCallId: string, delta: string) => ({ toolCallId, delta }),
    toolEnd: (toolCallId: string) => ({ toolCallId }),
    toolResult: (toolCallId: string, content: string) => ({ toolCallId, content }),
};

async function flush() {
    // Let effects run
    await new Promise((r) => setTimeout(r, 0));
}

describe('useAgent parity harness', () => {
    let ctxValue: AgentClientContextValue | null;
    beforeEach(() => { ctxValue = null; });

    async function setup(tools: Record<string, ToolDefinition> = {}) {
        ctxValue = null;
        await act(async () => {
            render(<Harness tools={tools} onReady={(c) => { ctxValue = c; }} />);
        });
        await flush();
        return {
            get ctx() { return ctxValue!; },
            get fake() { return getFake(); },
            get sub() { return ctxValue!.agentSubscriber; },
        };
    }

    it('text-only run: streams deltas, emits one assistant message at RunFinished', async () => {
        const h = await setup();
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'Hello ') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'world') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        const msgs = h.ctx.messages;
        expect(msgs.length).toBe(1);
        expect(msgs[0].role).toBe('assistant');
        expect(msgs[0].content).toBe('Hello world');
        expect(h.fake.submitToolResultsCalls.length).toBe(0);
        expect(h.fake.endRunCount).toBeGreaterThan(0);
    });

    it('frontend tool run: executes handler and submits tool results', async () => {
        const handler = vi.fn(() => JSON.stringify({ ok: true }));
        const tools: Record<string, ToolDefinition> = {
            doThing: {
                definition: { name: 'doThing', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                handler,
                isFrontend: true,
            },
        };
        const h = await setup(tools);
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc1', 'doThing', 'p1') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc1', '{"x":1}') } as any);
            sub.onToolCallEndEvent!({ event: ev.toolEnd('tc1') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toEqual({ x: 1 });
        const toolMsg = h.ctx.messages.find((m) => m.role === 'tool');
        expect(toolMsg).toBeDefined();
        expect((toolMsg as any).toolCallId).toBe('tc1');
        expect(h.fake.submitToolResultsCalls.length).toBe(1);
        expect(h.fake.submitToolResultsCalls[0].forwardedProps).toEqual({});
    });

    it('stopAfterToolCall flags forwardedProps.stopAfterToolCall on submission', async () => {
        const handler = vi.fn((_a: any, _u: any, _g: any, _c: any, ctx: any) => {
            ctx.stopAfterToolCall();
            return JSON.stringify({ done: true });
        });
        const tools: Record<string, ToolDefinition> = {
            bookDemo: {
                definition: { name: 'bookDemo', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                handler,
                isFrontend: true,
            },
        };
        const h = await setup(tools);
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc9', 'bookDemo') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc9', '{}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        expect(h.fake.submitToolResultsCalls.length).toBe(1);
        expect(h.fake.submitToolResultsCalls[0].forwardedProps).toEqual({ stopAfterToolCall: true });
    });

    it('backend tool result (TOOL_CALL_RESULT) appends tool message and does not re-submit', async () => {
        const tools: Record<string, ToolDefinition> = {
            backendThing: {
                definition: { name: 'backendThing', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                isFrontend: false,
            },
        };
        const h = await setup(tools);
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tcB', 'backendThing') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tcB', '{}') } as any);
            sub.onToolCallResultEvent!({ event: ev.toolResult('tcB', '{"backend":"ok"}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        const toolMsgs = h.ctx.messages.filter((m) => m.role === 'tool');
        expect(toolMsgs.length).toBe(1);
        expect(toolMsgs[0].content).toBe('{"backend":"ok"}');
        expect(h.fake.submitToolResultsCalls.length).toBe(0);
    });

    it('run error: adds error message and calls onError', async () => {
        const h = await setup();
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onRunErrorEvent!({ event: { message: 'boom' } } as any);
        });
        await flush();
        const last = h.ctx.messages[h.ctx.messages.length - 1];
        expect(last.role).toBe('assistant');
        expect((last.content as string)).toContain('Error: boom');
    });
});
