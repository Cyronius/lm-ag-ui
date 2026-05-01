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

function Harness({
    tools,
    onReady,
    suppressIntermediateAssistantMessages,
}: {
    tools: Record<string, ToolDefinition>;
    onReady: (ctx: AgentClientContextValue) => void;
    suppressIntermediateAssistantMessages?: boolean;
}) {
    const ctx = useAgent({ agentId: 'test', tools, suppressIntermediateAssistantMessages });
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

    async function setup(
        tools: Record<string, ToolDefinition> = {},
        opts: { suppressIntermediateAssistantMessages?: boolean } = {}
    ) {
        ctxValue = null;
        await act(async () => {
            render(
                <Harness
                    tools={tools}
                    onReady={(c) => { ctxValue = c; }}
                    suppressIntermediateAssistantMessages={opts.suppressIntermediateAssistantMessages}
                />
            );
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

    it('suppressIntermediateAssistantMessages OFF: chained-run text always lands (regression guard)', async () => {
        const handler = vi.fn(() => JSON.stringify({ done: true }));
        const tools: Record<string, ToolDefinition> = {
            chatty: {
                definition: { name: 'chatty', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                handler,
                isFrontend: true,
            },
        };
        const h = await setup(tools);
        const sub = h.sub;
        // Run 1: tool only.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc1', 'chatty') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc1', '{}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        // Run 2 (chained): text only.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r2') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'narration') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r2') } as any);
        });
        await flush();
        expect(h.ctx.messages.some(m => m.role === 'assistant' && m.content === 'narration')).toBe(true);
    });

    it('suppressIntermediateAssistantMessages ON: single-run turn with only text streams normally (text is both first and final)', async () => {
        const h = await setup({}, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'Hello world') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        const assistant = h.ctx.messages.filter(m => m.role === 'assistant');
        expect(assistant.length).toBe(1);
        expect(assistant[0].content).toBe('Hello world');
    });

    it('suppressIntermediateAssistantMessages ON: run1 (text+tool) → run2 (text only) shows BOTH', async () => {
        const handler = vi.fn(() => JSON.stringify({ done: true }));
        const tools: Record<string, ToolDefinition> = {
            doIt: {
                definition: { name: 'doIt', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                handler,
                isFrontend: true,
            },
        };
        const h = await setup(tools, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;

        // Run 1: text (first) + tool.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'first message') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc1', 'doIt') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc1', '{}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        // Run 2 (chained): text only — final result.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r2') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m2') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m2', 'final result') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m2') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r2') } as any);
        });
        await flush();
        const assistantTexts = h.ctx.messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(assistantTexts).toContain('first message');
        expect(assistantTexts).toContain('final result');
    });

    it('suppressIntermediateAssistantMessages ON: run1 (text+tool) → run2 (text+tool) → run3 (text only) drops the middle text', async () => {
        const handler = vi.fn(() => JSON.stringify({ done: true }));
        const tools: Record<string, ToolDefinition> = {
            doIt: {
                definition: { name: 'doIt', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                handler,
                isFrontend: true,
            },
        };
        const h = await setup(tools, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;

        // Run 1: first text + tool.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'first') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc1', 'doIt') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc1', '{}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        // Run 2 (chained): text + tool — middle, must be dropped.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r2') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m2') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m2', 'middle narration') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m2') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc2', 'doIt') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc2', '{}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r2') } as any);
        });
        await flush();
        // Run 3 (chained): text only — final.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r3') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m3') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m3', 'final') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m3') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r3') } as any);
        });
        await flush();
        const assistantTexts = h.ctx.messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(assistantTexts).toContain('first');
        expect(assistantTexts).toContain('final');
        expect(assistantTexts).not.toContain('middle narration');
    });

    it('suppressIntermediateAssistantMessages ON: run1 tool-only → run2 (text+tool) → run3 (text only) — first text appears in run2 and is preserved', async () => {
        const handler = vi.fn(() => JSON.stringify({ done: true }));
        const tools: Record<string, ToolDefinition> = {
            doIt: {
                definition: { name: 'doIt', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                handler,
                isFrontend: true,
            },
        };
        const h = await setup(tools, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;
        // Run 1: tool only, no text.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc1', 'doIt') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc1', '{}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        // Run 2 (chained): text + tool. No first-text was emitted yet this turn, so this text is "first" and streams live.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r2') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m2') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m2', 'first text in chain') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m2') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc2', 'doIt') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc2', '{}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r2') } as any);
        });
        await flush();
        // Run 3 (chained): text only — final.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r3') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m3') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m3', 'final answer') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m3') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r3') } as any);
        });
        await flush();
        const assistantTexts = h.ctx.messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(assistantTexts).toContain('first text in chain');
        expect(assistantTexts).toContain('final answer');
    });

    it('suppressIntermediateAssistantMessages ON: turn boundary resets first-text tracking when a fresh runAgent fires', async () => {
        // First turn: a single-run text-only response.
        const h = await setup({}, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'first turn answer') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        // Second turn — no submitToolResults fired, so the suppressor resets first-text.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r2') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m2') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m2', 'second turn answer') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m2') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r2') } as any);
        });
        await flush();
        const assistantTexts = h.ctx.messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(assistantTexts).toContain('first turn answer');
        expect(assistantTexts).toContain('second turn answer');
    });

    it('suppressIntermediateAssistantMessages ON: RunError mid-chain clears buffer state', async () => {
        const handler = vi.fn(() => JSON.stringify({ done: true }));
        const tools: Record<string, ToolDefinition> = {
            doIt: {
                definition: { name: 'doIt', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                handler,
                isFrontend: true,
            },
        };
        const h = await setup(tools, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;
        // Run 1: text + tool (first text streams).
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'first') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tc1', 'doIt') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tc1', '{}') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        // Run 2 (chained): begins, then errors after partial buffered text.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r2') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m2') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m2', 'partial') } as any);
            sub.onRunErrorEvent!({ event: { message: 'boom' } } as any);
        });
        await flush();
        // Next turn (fresh runAgent): first text should reset — appears in history.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r3') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m3') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m3', 'recovered') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m3') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r3') } as any);
        });
        await flush();
        const assistantTexts = h.ctx.messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(assistantTexts).toContain('recovered');
        expect(assistantTexts).not.toContain('partial');
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

    it('suppressIntermediateAssistantMessages ON: backend tool result + trailing text in same run — trailing text commits', async () => {
        // Regression: a single run where a backend tool resolves mid-stream and
        // the agent emits a final TextMessage after the tool result. The
        // trailing text is buffered (it's the second text in the turn) and
        // must commit at RunFinished — the tool already has its result, so
        // the run is terminal, not an intermediate step in a chain.
        const tools: Record<string, ToolDefinition> = {
            backendThing: {
                definition: { name: 'backendThing', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                isFrontend: false,
            },
        };
        const h = await setup(tools, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'preamble') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tcB', 'backendThing') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tcB', '{}') } as any);
            sub.onToolCallResultEvent!({ event: ev.toolResult('tcB', '{"ok":false,"error":"not configured"}') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m2') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m2', 'final apology') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m2') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();
        const assistantTexts = h.ctx.messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(assistantTexts).toContain('final apology');
        expect(h.fake.submitToolResultsCalls.length).toBe(0);
    });

    it('suppressIntermediateAssistantMessages ON: frontend tool with trailing text in run1 still drops the mid-chain text (regression)', async () => {
        // Counterpart to the backend-tool case: a frontend tool has no
        // ToolCallResult in the same run; the chained run continues. The
        // trailing text in run1 is intermediate narration and must drop.
        const tools: Record<string, ToolDefinition> = {
            frontendThing: {
                definition: { name: 'frontendThing', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                isFrontend: true,
                handler: () => '{"ok":true}',
            },
        };
        const h = await setup(tools, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', 'first') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tcF', 'frontendThing') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tcF', '{}') } as any);
            sub.onToolCallEndEvent!({ event: ev.toolEnd('tcF') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m2') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m2', 'mid-chain narration') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m2') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r2') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m3') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m3', 'final after chain') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m3') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r2') } as any);
        });
        await flush();
        const assistantTexts = h.ctx.messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(assistantTexts).toContain('final after chain');
        expect(assistantTexts).not.toContain('mid-chain narration');
    });

    it('REPRO bug-report scenario: run1 FE tool → chained run2 BE tool with result + trailing text — trailing text commits', async () => {
        // Mirrors the actual production trace: agent calls a frontend tool
        // first (e.g. get_user_info), runner submits results, chained run2
        // calls a backend tool (submit_contact_form) that resolves mid-stream
        // and the agent emits a final apology. The final text MUST commit.
        const tools: Record<string, ToolDefinition> = {
            get_user_info: {
                definition: { name: 'get_user_info', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                isFrontend: true,
                handler: () => JSON.stringify({ ok: true, userName: 'a@b.com', firstName: 'A', lastName: 'B' }),
            },
            submit_contact_form: {
                definition: { name: 'submit_contact_form', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                isFrontend: false,
            },
        };
        const h = await setup(tools, { suppressIntermediateAssistantMessages: true });
        const sub = h.sub;

        // Run 1: assistant says "I'll help..." then calls FE get_user_info (no tool result).
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r1') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m1') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m1', "I'll help you submit a bug report.") } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m1') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tcA', 'get_user_info', 'm1') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tcA', '{}') } as any);
            sub.onToolCallEndEvent!({ event: ev.toolEnd('tcA') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r1') } as any);
        });
        await flush();

        // Run 2 (chained, post-tool-results): empty anchor text + BE tool with result + final apology.
        await act(async () => {
            sub.onRunStartedEvent!({ event: ev.runStarted('t1', 'r2') } as any);
            // Anchor empty text (the ToolCallStart's parentMessageId).
            sub.onTextMessageStartEvent!({ event: ev.textStart('m_anchor') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m_anchor') } as any);
            sub.onToolCallStartEvent!({ event: ev.toolStart('tcB', 'submit_contact_form', 'm_anchor') } as any);
            sub.onToolCallArgsEvent!({ event: ev.toolArgs('tcB', '{}') } as any);
            sub.onToolCallEndEvent!({ event: ev.toolEnd('tcB') } as any);
            sub.onToolCallResultEvent!({ event: ev.toolResult('tcB', '{"success":true}') } as any);
            sub.onTextMessageStartEvent!({ event: ev.textStart('m_final') } as any);
            sub.onTextMessageContentEvent!({ event: ev.textDelta('m_final', 'Your bug report has been submitted successfully.') } as any);
            sub.onTextMessageEndEvent!({ event: ev.textEnd('m_final') } as any);
            sub.onRunFinishedEvent!({ event: ev.runFinished('t1', 'r2') } as any);
        });
        await flush();
        const assistantTexts = h.ctx.messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(assistantTexts).toContain('Your bug report has been submitted successfully.');
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
