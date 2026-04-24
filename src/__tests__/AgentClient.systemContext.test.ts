import { describe, it, expect, vi } from 'vitest';
import { AgentClient } from '../AgentClient';
import type { Message } from '@ag-ui/client';

// Replace the inner HttpAgent's setMessages + runAgent with spies so we can
// inspect the exact outgoing message array per call without doing any HTTP.
function instrumentAgent(client: AgentClient) {
    const setMessagesSpy = vi.fn();
    const runAgentSpy = vi.fn().mockResolvedValue({ newMessages: [], result: null });
    const inner = (client as any).agent;
    inner.setMessages = setMessagesSpy;
    inner.runAgent = runAgentSpy;
    return { setMessagesSpy, runAgentSpy };
}

function noopSubscriber(): any {
    return {};
}

const userMsg = (content: string, id = 'u1'): Message =>
    ({ id, role: 'user', content } as Message);

const toolMsg = (content: string, toolCallId: string, id = `t_${toolCallId}`): Message =>
    ({ id, role: 'tool', content, toolCallId } as Message);

// Closure-backed builder fixture — no longer reads from forwardedProps.
let moduleIds: string[] = [];
const moduleIdsBuilder = (): string | null =>
    moduleIds.length ? moduleIds.join(',') : null;

describe('AgentClient system-context injection — driven by builder alone', () => {
    it('prepends a system message rendered by the builder', async () => {
        moduleIds = ['A', 'B'];
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: moduleIdsBuilder,
        });
        const { setMessagesSpy } = instrumentAgent(client);
        client.startNewRun();

        await client.runAgent([userMsg('hi')], [], noopSubscriber(), {});

        const outgoing = setMessagesSpy.mock.calls[0][0] as Message[];
        expect(outgoing[0].role).toBe('system');
        expect((outgoing[0] as any).content).toBe('A,B');
    });

    it('injects system context even when forwardedProps is empty', async () => {
        moduleIds = ['X'];
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: moduleIdsBuilder,
        });
        const { setMessagesSpy } = instrumentAgent(client);
        client.startNewRun();

        await client.runAgent([userMsg('hi')], [], noopSubscriber(), {});

        const outgoing = setMessagesSpy.mock.calls[0][0] as Message[];
        expect(outgoing[0].role).toBe('system');
        expect((outgoing[0] as any).content).toBe('X');
    });
});

describe('AgentClient system-context injection — nothing to inject', () => {
    it('does not prepend a system message when no builder is provided, regardless of forwardedProps', async () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
        });
        const { setMessagesSpy } = instrumentAgent(client);
        client.startNewRun();

        await client.runAgent([userMsg('hi')], [], noopSubscriber(), { user_email: 'a@b.com', foo: 'bar' });

        const outgoing = setMessagesSpy.mock.calls[0][0] as Message[];
        expect(outgoing.some(m => m.role === 'system')).toBe(false);
    });

    it('skips injection when the builder returns null', async () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: () => null,
        });
        const { setMessagesSpy } = instrumentAgent(client);
        client.startNewRun();

        await client.runAgent([userMsg('hi')], [], noopSubscriber(), { anything: 1 });

        const outgoing = setMessagesSpy.mock.calls[0][0] as Message[];
        expect(outgoing.some(m => m.role === 'system')).toBe(false);
    });
});

describe('AgentClient system-context injection — per-thread dedup', () => {
    it('skips re-injection when the rendered content is unchanged in the same thread', async () => {
        moduleIds = ['A'];
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: moduleIdsBuilder,
        });
        const { setMessagesSpy } = instrumentAgent(client);
        client.startNewRun();

        await client.runAgent([userMsg('hi')], [], noopSubscriber(), {});
        await client.runAgent([userMsg('again', 'u2')], [], noopSubscriber(), {});

        const first = setMessagesSpy.mock.calls[0][0] as Message[];
        const second = setMessagesSpy.mock.calls[1][0] as Message[];
        expect(first[0].role).toBe('system');
        expect(second.some(m => m.role === 'system')).toBe(false);
    });

    it('re-injects when the rendered content changes', async () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: moduleIdsBuilder,
        });
        const { setMessagesSpy } = instrumentAgent(client);
        client.startNewRun();

        moduleIds = ['A'];
        await client.runAgent([userMsg('hi')], [], noopSubscriber(), {});
        moduleIds = ['A', 'B'];
        await client.runAgent([userMsg('again', 'u2')], [], noopSubscriber(), {});

        const first = setMessagesSpy.mock.calls[0][0] as Message[];
        const second = setMessagesSpy.mock.calls[1][0] as Message[];
        expect((first[0] as any).content).toBe('A');
        expect((second[0] as any).content).toBe('A,B');
    });

    it('submitToolResults also participates in the dedup — same content not re-sent', async () => {
        moduleIds = ['A'];
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: moduleIdsBuilder,
        });
        const { setMessagesSpy } = instrumentAgent(client);
        client.startNewRun();

        await client.runAgent([userMsg('hi')], [], noopSubscriber(), {});
        await client.submitToolResults([toolMsg('ok', 'x1')], noopSubscriber(), [], {});

        const first = setMessagesSpy.mock.calls[0][0] as Message[];
        const second = setMessagesSpy.mock.calls[1][0] as Message[];
        expect(first.some(m => m.role === 'system')).toBe(true);
        expect(second.some(m => m.role === 'system')).toBe(false);
    });
});

describe('AgentClient system-context injection — state lifecycle', () => {
    it('endSession clears per-thread dedup memory', async () => {
        moduleIds = ['A'];
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: moduleIdsBuilder,
        });
        instrumentAgent(client);
        client.startNewRun();

        await client.runAgent([userMsg('hi')], [], noopSubscriber(), {});

        const map = (client as any)._injectedContextByThread as Map<string, string>;
        expect(map.has('t1')).toBe(true);

        client.endSession();
        expect(map.has('t1')).toBe(false);
    });
});

describe('AgentClient forwardedProps passthrough to RunAgentInput', () => {
    it('passes forwardedProps unchanged on runAgent, independent of system-message injection', async () => {
        moduleIds = ['A'];
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: moduleIdsBuilder,
        });
        const { runAgentSpy } = instrumentAgent(client);
        client.startNewRun();

        const fp = { user_email: 'x@y.com', extra: 42 };
        await client.runAgent([userMsg('hi')], [], noopSubscriber(), fp);

        const input = runAgentSpy.mock.calls[0][0];
        expect(input.forwardedProps).toEqual(fp);
    });

    it('passes forwardedProps on submitToolResults even when system message is deduped', async () => {
        moduleIds = ['A'];
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
            systemContextBuilder: moduleIdsBuilder,
        });
        const { runAgentSpy } = instrumentAgent(client);
        client.startNewRun();

        const fp = { user_email: 'x@y.com' };
        await client.runAgent([userMsg('hi')], [], noopSubscriber(), fp);
        await client.submitToolResults([toolMsg('ok', 'x1')], noopSubscriber(), [], fp);

        expect(runAgentSpy.mock.calls[0][0].forwardedProps).toEqual(fp);
        expect(runAgentSpy.mock.calls[1][0].forwardedProps).toEqual(fp);
    });

    it('passes forwardedProps on runAgent even when no system message is injected', async () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 't1',
            sendFullHistory: true,
        });
        const { runAgentSpy, setMessagesSpy } = instrumentAgent(client);
        client.startNewRun();

        const fp = { user_email: 'a@b.com' };
        await client.runAgent([userMsg('hi')], [], noopSubscriber(), fp);

        const outgoing = setMessagesSpy.mock.calls[0][0] as Message[];
        expect(outgoing.some(m => m.role === 'system')).toBe(false);
        expect(runAgentSpy.mock.calls[0][0].forwardedProps).toEqual(fp);
    });
});
