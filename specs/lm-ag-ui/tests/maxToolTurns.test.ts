// Traces: AGUI-MAX-TOOL-TURNS (canonical spec: specs/lm-ag-ui/spec.md)
import { describe, it, expect, vi } from 'vitest';
import type { AgentSubscriber, Message } from '@ag-ui/client';
import type { ToolDefinition, AgentError } from '../../../src/index';
import { AgentStore } from '../../../src/AgentStore';
import type { AgentClient } from '../../../src/AgentClient';

// Fake client that, on every tool-result submission, replays a run in which the
// agent immediately asks for the frontend tool again (a runaway chain) — until
// `answerOnRun` (if set), at which point it answers with text instead.
class LoopingFakeClient {
    session = { threadId: 't1', runId: null as string | null, isActive: false };
    debug = false;
    submissions = 0;
    runs = 0;
    answerOnRun: number | null = null;
    private _onSession?: (s: any) => void;
    setSessionChangeCallback(cb: (s: any) => void) { this._onSession = cb; cb(this.session); }
    startNewRun() { this.session = { ...this.session, runId: `r${++this.runs}`, isActive: true }; this._onSession?.(this.session); return this.session; }
    endRun() { this.session = { ...this.session, isActive: false }; this._onSession?.(this.session); }
    abortRun() { this.endRun(); }
    setState(_s: any) {}
    async runAgent(_m: Message[], _t: any[], sub: AgentSubscriber) { this.replayRun(sub); }
    async submitToolResults(_m: Message[], sub: AgentSubscriber) {
        this.submissions += 1;
        await Promise.resolve();
        this.replayRun(sub);
    }
    replayRun(sub: AgentSubscriber) {
        const runId = this.session.runId!;
        sub.onRunStartedEvent!({ event: { threadId: 't1', runId } } as any);
        if (this.answerOnRun !== null && this.runs >= this.answerOnRun) {
            sub.onTextMessageStartEvent!({ event: { messageId: `m${runId}`, role: 'assistant' } } as any);
            sub.onTextMessageContentEvent!({ event: { messageId: `m${runId}`, delta: 'Done.' } } as any);
            sub.onTextMessageEndEvent!({ event: { messageId: `m${runId}` } } as any);
        } else {
            sub.onToolCallStartEvent!({ event: { toolCallId: `call_${runId}`, toolCallName: 'ping' } } as any);
            sub.onToolCallArgsEvent!({ event: { toolCallId: `call_${runId}`, delta: '{}' } } as any);
        }
        sub.onRunFinishedEvent!({ event: { threadId: 't1', runId } } as any);
    }
}

const tools: Record<string, ToolDefinition> = {
    ping: {
        definition: { name: 'ping', description: '', parameters: { type: 'object', properties: {}, required: [] } },
        isFrontend: true,
        handler: () => 'pong',
    },
};

async function settle() {
    for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
}

function make(maxToolTurns: number | undefined, onError = vi.fn<(e: AgentError) => void>()) {
    const fake = new LoopingFakeClient();
    const store = new AgentStore(fake as unknown as AgentClient, { tools, maxToolTurns, onError });
    return { fake, store, onError };
}

async function startTurn(store: AgentStore, fake: LoopingFakeClient) {
    store.addMessage({ id: 'u1', role: 'user', content: 'go' });
    store.beginTurn();
    await fake.runAgent([], [], store);
    await settle();
}

describe('AGUI-MAX-TOOL-TURNS', () => {
    it('cuts a runaway chain after maxToolTurns submissions', async () => {
        const { fake, store, onError } = make(2);
        await startTurn(store, fake);

        expect(fake.submissions).toBe(2);
        expect(store.getSnapshot().hasPendingToolWork).toBe(false);
        expect(store.getSnapshot().isBusy).toBe(false);
        const last = store.getState().messages.at(-1)!;
        expect(last.role).toBe('assistant');
        expect(last.content).toMatch(/Stopped after 2 chained tool turns/);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].code).toBe('max_tool_turns');
    });

    it('does not fire when the agent answers within the cap', async () => {
        const { fake, store, onError } = make(2);
        fake.answerOnRun = 3; // run1 tool, run2 tool, run3 text
        await startTurn(store, fake);

        expect(fake.submissions).toBe(2);
        expect(onError).not.toHaveBeenCalled();
        expect(store.getState().messages.at(-1)!.content).toBe('Done.');
    });

    it('resets the counter on beginTurn', async () => {
        const { fake, store, onError } = make(2);
        await startTurn(store, fake);
        expect(fake.submissions).toBe(2);

        await startTurn(store, fake);
        expect(fake.submissions).toBe(4);
        expect(onError).toHaveBeenCalledTimes(2);
    });

    it('defaults to 8', async () => {
        const { fake, store } = make(undefined);
        await startTurn(store, fake);
        expect(fake.submissions).toBe(8);
    });
});
