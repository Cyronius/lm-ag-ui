// Traces: AGUI-CUSTOM-EVENT-LISTENER (canonical spec: specs/lm-ag-ui/spec.md)
import { describe, it, expect, vi } from 'vitest';
import type { AgentSubscriber, CustomEvent, Message } from '@ag-ui/client';
import { AgentStore } from '../../../src/AgentStore';
import type { AgentClient } from '../../../src/AgentClient';

class FakeAgentClient {
    session = { threadId: 't1', runId: null as string | null, isActive: false };
    debug = false;
    setSessionChangeCallback(cb: (s: any) => void) { cb(this.session); }
    startNewRun() { return this.session; }
    endRun() {}
    abortRun() {}
    setState(_s: any) {}
    async runAgent(_m: Message[], _t: any[], _s: AgentSubscriber) {}
    async submitToolResults(_m: Message[], _s: AgentSubscriber) {}
}

const custom = { type: 'CUSTOM', name: 'toolLibrary.activeCategories', value: { active: ['a'], added: ['a'] } } as unknown as CustomEvent;

describe('AGUI-CUSTOM-EVENT-LISTENER', () => {
    it('invokes onCustomEvent with the event payload', () => {
        const onCustomEvent = vi.fn();
        const store = new AgentStore(new FakeAgentClient() as unknown as AgentClient, { onCustomEvent });

        store.onCustomEvent({ event: custom });

        expect(onCustomEvent).toHaveBeenCalledTimes(1);
        expect(onCustomEvent.mock.calls[0][0]).toBe(custom);
        expect(onCustomEvent.mock.calls[0][0].name).toBe('toolLibrary.activeCategories');
    });

    it('setOptions swaps the listener', () => {
        const first = vi.fn();
        const second = vi.fn();
        const store = new AgentStore(new FakeAgentClient() as unknown as AgentClient, { onCustomEvent: first });

        store.setOptions({ onCustomEvent: second });
        store.onCustomEvent({ event: custom });

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('is a no-op without a listener', () => {
        const store = new AgentStore(new FakeAgentClient() as unknown as AgentClient, {});
        expect(() => store.onCustomEvent({ event: custom })).not.toThrow();
    });
});
