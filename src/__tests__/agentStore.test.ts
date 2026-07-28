// Store-level tests for the React-free AgentStore: the same event pipeline the
// useAgent parity harness exercises, but driven directly — no React, no act().
// The parity test (useAgent.parity.test.tsx) remains the facade-level gate;
// this suite covers the store contract (snapshots, lifecycle, options, dispose)
// and behavior only reachable without React (fake-timer watchdog paths).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentSubscriber, Message } from '@ag-ui/client';
import type { ToolDefinition } from '../index';
import { AgentStore } from '../AgentStore';
import type { AgentClient } from '../AgentClient';

interface FakeSession {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
}

class FakeAgentClient {
    session: FakeSession = { threadId: 't1', runId: null, isActive: false };
    debug = false;
    runAgentCalls: Array<{ messages: Message[]; tools: any[]; forwardedProps?: any }> = [];
    submitToolResultsCalls: Array<{ messages: Message[]; tools: any[]; forwardedProps?: any }> = [];
    startNewRunCount = 0;
    endRunCount = 0;
    abortRunCount = 0;
    submitShouldReject = false;
    private _onSession?: (s: FakeSession) => void;

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
    // Mirrors the real AgentClient: abortRun aborts the transport then endRun()s.
    abortRun() { this.abortRunCount++; this.endRun(); }
    setState(_s: any) {}
    async runAgent(messages: Message[], tools: any[], _sub: AgentSubscriber, forwardedProps?: any) {
        this.runAgentCalls.push({ messages, tools, forwardedProps });
    }
    async submitToolResults(messages: Message[], _sub: AgentSubscriber, tools: any[], forwardedProps?: any) {
        this.submitToolResultsCalls.push({ messages, tools, forwardedProps });
        if (this.submitShouldReject) throw new Error('submit failed');
    }
}

function makeStore(
    tools: Record<string, ToolDefinition> = {},
    opts: Partial<ConstructorParameters<typeof AgentStore>[1] & {}> = {}
) {
    const fake = new FakeAgentClient();
    const store = new AgentStore(fake as unknown as AgentClient, { tools, ...opts });
    return { fake, store };
}

const ev = {
    runStarted: (threadId: string, runId: string) => ({ event: { threadId, runId } } as any),
    textStart: (messageId: string) => ({ event: { messageId, role: 'assistant' } } as any),
    textDelta: (messageId: string, delta: string) => ({ event: { messageId, delta } } as any),
    textEnd: (messageId: string) => ({ event: { messageId } } as any),
    runFinished: (threadId: string, runId: string) => ({ event: { threadId, runId } } as any),
    runError: (message: string) => ({ event: { message } } as any),
    toolStart: (toolCallId: string, toolCallName: string, parentMessageId?: string) =>
        ({ event: { toolCallId, toolCallName, parentMessageId } } as any),
    toolArgs: (toolCallId: string, delta: string) => ({ event: { toolCallId, delta } } as any),
    toolResult: (toolCallId: string, content: string) => ({ event: { toolCallId, content } } as any),
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function frontendTool(name: string, handler: ToolDefinition['handler']): ToolDefinition {
    return {
        definition: { name, description: '', parameters: { type: 'object', properties: {}, required: [] } },
        handler,
        isFrontend: true,
    };
}

beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('AgentStore event pipeline (no React)', () => {
    it('text-only run: streams deltas, commits one assistant message at RunFinished', async () => {
        const { fake, store } = makeStore();
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onTextMessageStartEvent(ev.textStart('m1'));
        store.onTextMessageContentEvent(ev.textDelta('m1', 'Hello '));
        expect(store.getSnapshot().state.streamingText).toBe('Hello ');
        store.onTextMessageContentEvent(ev.textDelta('m1', 'world'));
        store.onTextMessageEndEvent(ev.textEnd('m1'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        const msgs = store.getSnapshot().state.messages;
        expect(msgs).toHaveLength(1);
        expect(msgs[0].role).toBe('assistant');
        expect(msgs[0].content).toBe('Hello world');
        expect(fake.submitToolResultsCalls).toHaveLength(0);
        expect(fake.endRunCount).toBeGreaterThan(0);
    });

    it('frontend tool run: executes handler and submits tool results with the store as subscriber', async () => {
        const handler = vi.fn(() => JSON.stringify({ ok: true }));
        const { fake, store } = makeStore({ doThing: frontendTool('doThing', handler) });
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tc1', 'doThing'));
        store.onToolCallArgsEvent(ev.toolArgs('tc1', '{"x":1}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toEqual({ x: 1 });
        const toolMsg = store.getState().messages.find((m) => m.role === 'tool');
        expect(toolMsg).toBeDefined();
        expect((toolMsg as any).toolCallId).toBe('tc1');
        expect(fake.submitToolResultsCalls).toHaveLength(1);
        expect(fake.startNewRunCount).toBe(2);
    });

    it('reentrancy guard: an overlapping RunFinished during a slow handler does not re-run the tool', async () => {
        let resolveHandler: (v: string) => void = () => {};
        const handler = vi.fn(() => new Promise<string>((resolve) => { resolveHandler = resolve; }));
        const { fake, store } = makeStore({ slow: frontendTool('slow', handler) });
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tc1', 'slow'));
        store.onToolCallArgsEvent(ev.toolArgs('tc1', '{}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        // Overlapping RunFinished while the handler is still pending — tool
        // buffers are not yet cleared; the guard must swallow the re-entry.
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        resolveHandler('{"ok":true}');
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(fake.submitToolResultsCalls).toHaveLength(1);
    });

    it('run error: flushes a received tool result into an owning assistant.toolCalls message', async () => {
        const { fake, store } = makeStore({
            backendThing: {
                definition: { name: 'backendThing', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                isFrontend: false,
            },
        });
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tcB', 'backendThing'));
        store.onToolCallArgsEvent(ev.toolArgs('tcB', '{}'));
        store.onToolCallResultEvent(ev.toolResult('tcB', '{"backend":"ok"}'));
        store.onRunErrorEvent(ev.runError('boom'));
        await flush();
        const messages = store.getState().messages;
        const toolIdx = messages.findIndex((m) => m.role === 'tool');
        expect(toolIdx).toBeGreaterThan(0);
        const owner = messages[toolIdx - 1] as any;
        expect(owner.role).toBe('assistant');
        expect(owner.toolCalls?.map((tc: any) => tc.id)).toEqual(['tcB']);
        expect(messages[messages.length - 1].content).toContain('Error: boom');
    });
});

describe('AgentStore snapshot contract', () => {
    it('getSnapshot is referentially stable until a real change', () => {
        const { store } = makeStore();
        const a = store.getSnapshot();
        expect(store.getSnapshot()).toBe(a);
        store.addMessage({ id: 'u1', role: 'user', content: 'hi' });
        const b = store.getSnapshot();
        expect(b).not.toBe(a);
        expect(store.getSnapshot()).toBe(b);
    });

    it('a no-op dispatch does not invalidate the snapshot', () => {
        const { store } = makeStore();
        const a = store.getSnapshot();
        // TOOL_CALL_ARGS for an unknown id: reducer returns the same state.
        store.dispatch({ type: 'TOOL_CALL_ARGS', toolCallId: 'nope', delta: 'x' });
        expect(store.getSnapshot()).toBe(a);
    });

    it('getServerSnapshot returns one constant, inactive snapshot', () => {
        const { fake, store } = makeStore();
        const server = store.getServerSnapshot();
        fake.startNewRun();
        store.addMessage({ id: 'u1', role: 'user', content: 'hi' });
        expect(store.getServerSnapshot()).toBe(server);
        expect(server.isStreaming).toBe(false);
        expect(server.isBusy).toBe(false);
        expect(server.state.messages).toHaveLength(0);
    });

    it('session transitions invalidate the snapshot and derive isStreaming/isBusy', () => {
        const { fake, store } = makeStore();
        expect(store.getSnapshot().isStreaming).toBe(false);
        fake.startNewRun();
        expect(store.getSnapshot().isStreaming).toBe(true);
        expect(store.getSnapshot().isBusy).toBe(true);
        fake.endRun();
        expect(store.getSnapshot().isStreaming).toBe(false);
        expect(store.getSnapshot().isBusy).toBe(false);
    });

    it('notifies subscribers on change and stops after unsubscribe', () => {
        const { store } = makeStore();
        const listener = vi.fn();
        const unsub = store.subscribe(listener);
        store.addMessage({ id: 'u1', role: 'user', content: 'hi' });
        expect(listener).toHaveBeenCalledTimes(1);
        unsub();
        store.addMessage({ id: 'u2', role: 'user', content: 'again' });
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('AgentStore isBusy / pending tool work', () => {
    it('isBusy stays true across the endRun → handler-await → startNewRun gap', async () => {
        let resolveHandler: (v: string) => void = () => {};
        const handler = vi.fn(() => new Promise<string>((resolve) => { resolveHandler = resolve; }));
        const { fake, store } = makeStore({ slow: frontendTool('slow', handler) });
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tc1', 'slow'));
        store.onToolCallArgsEvent(ev.toolArgs('tc1', '{}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        expect(store.getSnapshot().isStreaming).toBe(false);
        expect(store.getSnapshot().isBusy).toBe(true);
        resolveHandler('{"ok":true}');
        await flush();
        expect(fake.submitToolResultsCalls).toHaveLength(1);
        expect(store.getSnapshot().isBusy).toBe(true);
        store.onRunFinishedEvent(ev.runFinished('t1', 'r2'));
        await flush();
        expect(store.getSnapshot().isBusy).toBe(false);
    });

    it('clears pending tool work when a chained run errors out (fix: isBusy no longer sticks)', async () => {
        const handler = vi.fn(() => '{"ok":true}');
        const { fake, store } = makeStore({ doThing: frontendTool('doThing', handler) });
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tc1', 'doThing'));
        store.onToolCallArgsEvent(ev.toolArgs('tc1', '{}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        expect(fake.submitToolResultsCalls).toHaveLength(1);
        store.onRunStartedEvent(ev.runStarted('t1', 'r2'));
        store.onRunErrorEvent(ev.runError('boom'));
        await flush();
        expect(store.getSnapshot().hasPendingToolWork).toBe(false);
        expect(store.getSnapshot().isBusy).toBe(false);
    });

    it('clears pending tool work when nothing is submittable (backend tool with no result)', async () => {
        const { fake, store } = makeStore({
            backendOnly: {
                definition: { name: 'backendOnly', description: '', parameters: { type: 'object', properties: {}, required: [] } },
                isFrontend: false,
            },
        });
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tcB', 'backendOnly'));
        store.onToolCallArgsEvent(ev.toolArgs('tcB', '{}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        expect(fake.submitToolResultsCalls).toHaveLength(0);
        expect(store.getSnapshot().hasPendingToolWork).toBe(false);
        expect(store.getSnapshot().isBusy).toBe(false);
    });

    it('clears pending tool work when tool-result submission rejects', async () => {
        const handler = vi.fn(() => '{"ok":true}');
        const { fake, store } = makeStore({ doThing: frontendTool('doThing', handler) });
        fake.submitShouldReject = true;
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tc1', 'doThing'));
        store.onToolCallArgsEvent(ev.toolArgs('tc1', '{}'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        expect(store.getSnapshot().hasPendingToolWork).toBe(false);
        expect(store.getState().messages.some(m => `${m.content}`.includes('Failed to submit tool results'))).toBe(true);
    });

    it('terminateRun clears pending tool work and truncates to the pre-run message count', async () => {
        let resolveHandler: (v: string) => void = () => {};
        const handler = vi.fn(() => new Promise<string>((resolve) => { resolveHandler = resolve; }));
        const { fake, store } = makeStore({ slow: frontendTool('slow', handler) });
        store.addMessage({ id: 'u1', role: 'user', content: 'go' });
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tc1', 'slow'));
        store.onToolCallArgsEvent(ev.toolArgs('tc1', '{}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        expect(store.getSnapshot().isBusy).toBe(true);
        store.terminateRun();
        expect(store.getSnapshot().hasPendingToolWork).toBe(false);
        expect(store.getSnapshot().isBusy).toBe(false);
        resolveHandler('{"ok":true}');
        await flush();
    });
});

describe('AgentStore watchdog (fake timers)', () => {
    it('idle timeout aborts the run, reports onError, and adds a timeout message', () => {
        vi.useFakeTimers();
        const onError = vi.fn();
        const { fake, store } = makeStore({}, { idleTimeoutMs: 1_000, safetyTimeoutMs: 60_000, onError });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        fake.startNewRun();
        vi.advanceTimersByTime(900);
        store.onEvent(); // progress: idle timer resets
        vi.advanceTimersByTime(900);
        expect(onError).not.toHaveBeenCalled();
        vi.advanceTimersByTime(101);
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'timeout' }));
        expect(fake.abortRunCount).toBe(1);
        const last = store.getState().messages[store.getState().messages.length - 1];
        expect(last.content).toContain('timed out');
    });

    it('absolute cap fires even when events keep arriving', () => {
        vi.useFakeTimers();
        const onError = vi.fn();
        const { fake, store } = makeStore({}, { idleTimeoutMs: 1_000, safetyTimeoutMs: 3_000, onError });
        fake.startNewRun();
        for (let elapsed = 0; elapsed < 3_000; elapsed += 500) {
            vi.advanceTimersByTime(500);
            store.onEvent();
        }
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'timeout' }));
        expect(onError.mock.calls[0][0].message).toContain('max duration');
    });

    it('watchdog stops when the run ends normally', () => {
        vi.useFakeTimers();
        const onError = vi.fn();
        const { fake } = makeStore({}, { idleTimeoutMs: 1_000, safetyTimeoutMs: 3_000, onError });
        fake.startNewRun();
        fake.endRun();
        vi.advanceTimersByTime(60_000);
        expect(onError).not.toHaveBeenCalled();
    });
});

describe('AgentStore options and lifecycle', () => {
    it('setOptions swaps tools mid-session (late handler registration wins)', async () => {
        const { fake, store } = makeStore({});
        const handler = vi.fn(() => '{"ok":true}');
        store.setOptions({ tools: { lateTool: frontendTool('lateTool', handler) } });
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onToolCallStartEvent(ev.toolStart('tc1', 'lateTool'));
        store.onToolCallArgsEvent(ev.toolArgs('tc1', '{}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(fake.submitToolResultsCalls).toHaveLength(1);
    });

    it('setOptions toggles intermediate-message suppression live', async () => {
        const { fake, store } = makeStore({ doIt: frontendTool('doIt', () => '{"ok":true}') });
        store.setOptions({
            tools: { doIt: frontendTool('doIt', () => '{"ok":true}') },
            suppressIntermediateAssistantMessages: true,
        });
        fake.startNewRun();
        // Run 1: first text + tool (first text streams and commits).
        store.onRunStartedEvent(ev.runStarted('t1', 'r1'));
        store.onTextMessageStartEvent(ev.textStart('m1'));
        store.onTextMessageContentEvent(ev.textDelta('m1', 'first'));
        store.onTextMessageEndEvent(ev.textEnd('m1'));
        store.onToolCallStartEvent(ev.toolStart('tc1', 'doIt'));
        store.onToolCallArgsEvent(ev.toolArgs('tc1', '{}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
        await flush();
        // Run 2 (chained): middle narration + tool — must drop.
        store.onRunStartedEvent(ev.runStarted('t1', 'r2'));
        store.onTextMessageStartEvent(ev.textStart('m2'));
        store.onTextMessageContentEvent(ev.textDelta('m2', 'middle narration'));
        store.onTextMessageEndEvent(ev.textEnd('m2'));
        store.onToolCallStartEvent(ev.toolStart('tc2', 'doIt'));
        store.onToolCallArgsEvent(ev.toolArgs('tc2', '{}'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r2'));
        await flush();
        // Run 3 (chained): final text — commits.
        store.onRunStartedEvent(ev.runStarted('t1', 'r3'));
        store.onTextMessageStartEvent(ev.textStart('m3'));
        store.onTextMessageContentEvent(ev.textDelta('m3', 'final'));
        store.onTextMessageEndEvent(ev.textEnd('m3'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r3'));
        await flush();
        const texts = store.getState().messages.filter(m => m.role === 'assistant').map(m => m.content);
        expect(texts).toContain('first');
        expect(texts).toContain('final');
        expect(texts).not.toContain('middle narration');
    });

    it('dispose aborts an active run, stops timers, and leaves the store usable (StrictMode contract)', async () => {
        vi.useFakeTimers();
        const onError = vi.fn();
        const { fake, store } = makeStore({}, { idleTimeoutMs: 1_000, safetyTimeoutMs: 3_000, onError });
        fake.startNewRun();
        store.dispose();
        expect(fake.abortRunCount).toBe(1);
        vi.advanceTimersByTime(60_000);
        expect(onError).not.toHaveBeenCalled();
        vi.useRealTimers();
        // Store must remain fully usable after dispose (dev double-mount).
        fake.startNewRun();
        store.onRunStartedEvent(ev.runStarted('t1', 'r2'));
        store.onTextMessageStartEvent(ev.textStart('m1'));
        store.onTextMessageContentEvent(ev.textDelta('m1', 'after dispose'));
        store.onTextMessageEndEvent(ev.textEnd('m1'));
        store.onRunFinishedEvent(ev.runFinished('t1', 'r2'));
        await flush();
        expect(store.getState().messages.some(m => m.content === 'after dispose')).toBe(true);
    });

    it('invokeToolByName runs the agent with the tool definition and a synthesized user message', async () => {
        const tool = frontendTool('myTool', () => '{"ok":true}');
        const { fake, store } = makeStore({ myTool: tool });
        await store.invokeToolByName('myTool', { a: 1 });
        expect(fake.startNewRunCount).toBe(1);
        expect(fake.runAgentCalls).toHaveLength(1);
        const call = fake.runAgentCalls[0];
        expect(call.tools).toEqual([tool.definition]);
        expect(call.messages[call.messages.length - 1].role).toBe('user');
        expect(call.messages[call.messages.length - 1].content).toContain('myTool');
        expect(call.forwardedProps).toEqual({ a: 1 });
    });

    it('invokeToolByName with an unknown tool adds an error message and does not start a run', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { fake, store } = makeStore({});
        await store.invokeToolByName('nope');
        expect(fake.startNewRunCount).toBe(0);
        expect(store.getState().messages[0].content).toContain("Tool 'nope' not found");
    });
});
