// Traces: AGUI-TOOL-RESULT-ADJACENCY (canonical spec: specs/lm-ag-ui/spec.md)
//
// Replay of a live lm-admin mobi_cbiv run (2026-09-01,
// thread_1788298897302_e97703a7): a backend tool (generate_image_variants)
// returns its result in-run, then the agent emits a trailing text segment
// ("Would you like me to add one…"). With suppressIntermediateAssistantMessages
// on, that trailing segment is buffered until RUN_FINISHED. The store must end
// up with assistant(toolCalls) → tool → assistant(text); otherwise the next
// full-history send carries an orphaned tool result that the backend's
// adjacency sanitizer drops, and the agent "doesn't have" the URLs.
import { describe, it, expect } from 'vitest';
import type { AgentSubscriber, Message } from '@ag-ui/client';
import type { ToolDefinition } from '../../../src/index';
import { AgentStore } from '../../../src/AgentStore';
import type { AgentClient } from '../../../src/AgentClient';

class FakeAgentClient {
    session = { threadId: 't1', runId: null as string | null, isActive: false };
    debug = false;
    private _onSession?: (s: any) => void;
    setSessionChangeCallback(cb: (s: any) => void) { this._onSession = cb; cb(this.session); }
    startNewRun() { this.session = { ...this.session, runId: 'r1', isActive: true }; this._onSession?.(this.session); return this.session; }
    endRun() { this.session = { ...this.session, isActive: false }; this._onSession?.(this.session); }
    abortRun() { this.endRun(); }
    setState(_s: any) {}
    async runAgent(_m: Message[], _t: any[], _s: AgentSubscriber) {}
    async submitToolResults(_m: Message[], _s: AgentSubscriber) {}
}

const ev = {
    runStarted: (threadId: string, runId: string) => ({ event: { threadId, runId } } as any),
    textStart: (messageId: string) => ({ event: { messageId, role: 'assistant' } } as any),
    textDelta: (messageId: string, delta: string) => ({ event: { messageId, delta } } as any),
    textEnd: (messageId: string) => ({ event: { messageId } } as any),
    runFinished: (threadId: string, runId: string) => ({ event: { threadId, runId } } as any),
    toolStart: (toolCallId: string, toolCallName: string, parentMessageId?: string) =>
        ({ event: { toolCallId, toolCallName, parentMessageId } } as any),
    toolArgs: (toolCallId: string, delta: string) => ({ event: { toolCallId, delta } } as any),
    toolResult: (toolCallId: string, content: string) => ({ event: { toolCallId, content } } as any),
};

const backendTool: Record<string, ToolDefinition> = {
    generate_image_variants: {
        definition: { name: 'generate_image_variants', description: '', parameters: { type: 'object', properties: {}, required: [] } },
        isFrontend: false,
    } as ToolDefinition,
};

function shape(messages: Message[]): string[] {
    return messages.map((m) => {
        const tc = (m as any).toolCalls as Array<{ id: string }> | undefined;
        const text = typeof m.content === 'string' && m.content.trim() ? `"${m.content.slice(0, 12)}"` : '';
        if (m.role === 'assistant' && tc?.length) return `assistant(${[text, `toolCalls=${tc.map((c) => c.id).join(',')}`].filter(Boolean).join(' ')})`;
        if (m.role === 'tool') return `tool(${(m as any).toolCallId})`;
        return `${m.role}(${text})`;
    });
}

function makeStore(suppress: boolean) {
    const fake = new FakeAgentClient();
    const store = new AgentStore(fake as unknown as AgentClient, {
        tools: backendTool,
        suppressIntermediateAssistantMessages: suppress,
    });
    return { fake, store };
}

async function backendToolThenTrailingText(store: AgentStore, fake: FakeAgentClient, firstSegment: string | null) {
    store.addMessage({ id: 'u1', role: 'user', content: 'make an image of a duck on a truck' });
    fake.startNewRun();
    store.onRunStartedEvent(ev.runStarted('t1', 'r1'));

    store.onTextMessageStartEvent(ev.textStart('m1'));
    if (firstSegment) store.onTextMessageContentEvent(ev.textDelta('m1', firstSegment));
    store.onTextMessageEndEvent(ev.textEnd('m1'));
    store.onToolCallStartEvent(ev.toolStart('call_1', 'generate_image_variants', 'm1'));
    store.onToolCallArgsEvent(ev.toolArgs('call_1', '{"prompt":"duck"}'));
    store.onToolCallResultEvent(ev.toolResult('call_1', "{'urls': ['https://blob/a.jpg']}"));
    store.onTextMessageStartEvent(ev.textStart('m2'));
    store.onTextMessageContentEvent(ev.textDelta('m2', 'Would you like me to add one of these images?'));
    store.onTextMessageEndEvent(ev.textEnd('m2'));
    store.onRunFinishedEvent(ev.runFinished('t1', 'r1'));
    await new Promise((r) => setTimeout(r, 0));
}

describe('AGUI-TOOL-RESULT-ADJACENCY', () => {
    it('suppression on, empty first segment: assistant(toolCalls) → tool → assistant(text)', async () => {
        const { fake, store } = makeStore(true);
        await backendToolThenTrailingText(store, fake, null);
        expect(shape(store.getState().messages)).toEqual([
            'user("make an imag")',
            'assistant(toolCalls=call_1)',
            'tool(call_1)',
            'assistant("Would you li")',
        ]);
    });

    it('suppression on, live first segment: assistant(text+toolCalls) → tool → assistant(text)', async () => {
        const { fake, store } = makeStore(true);
        await backendToolThenTrailingText(store, fake, 'Looking that up.');
        expect(shape(store.getState().messages)).toEqual([
            'user("make an imag")',
            'assistant("Looking that" toolCalls=call_1)',
            'tool(call_1)',
            'assistant("Would you li")',
        ]);
    });

    it('suppression off: same adjacency', async () => {
        const { fake, store } = makeStore(false);
        await backendToolThenTrailingText(store, fake, null);
        const s = shape(store.getState().messages);
        const toolIdx = s.findIndex((x) => x.startsWith('tool('));
        expect(s[toolIdx - 1]).toBe('assistant(toolCalls=call_1)');
        expect(s[s.length - 1]).toBe('assistant("Would you li")');
    });
});
