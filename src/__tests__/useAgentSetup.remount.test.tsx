// Regression: useAgentSetup used to build AgentLayer in a useMemo keyed on 16
// option identities (including the config object). Any identity churn — an
// unmemoized `tools` object, an inline `buildForwardedProps`, or a config
// refetch replacing the config object — created a NEW component type, which
// unmounted the whole agent subtree and silently discarded the conversation.
// The Layer identity is now keyed only on [config-loaded, baseUrl, agentId].
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render } from '@testing-library/react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import type { AgentClientContextValue, ToolDefinition } from '../index';

vi.mock('../AgentClient', () => {
    class FakeAgentClient {
        session = { threadId: 't1', runId: null as string | null, isActive: false };
        debug = false;
        constructor(_baseUrl?: string, _agentId?: string, _opts?: any) {}
        setSessionChangeCallback(cb: (s: any) => void) { cb(this.session); }
        setTokenProvider(_tp?: any) {}
        startNewRun() {}
        endRun() {}
        abortRun() {}
        setState(_s: any) {}
        async runAgent() {}
        async submitToolResults() {}
    }
    return { AgentClient: FakeAgentClient };
});

vi.mock('../configService', () => ({
    loadAgentConfig: vi.fn(async () => ({ suggestions: [], toolConfigs: [] })),
}));

import { useAgentSetup } from '../useAgentSetup';
import { useAgentContext } from '../AgentClientContext';

function Child({ onCtx }: { onCtx: (ctx: AgentClientContextValue) => void }) {
    const ctx = useAgentContext();
    React.useEffect(() => { onCtx(ctx); });
    return null;
}

function Root({
    tools,
    tokenProvider,
    buildForwardedProps,
    onCtx,
}: {
    tools: Record<string, ToolDefinition>;
    tokenProvider: () => Promise<string | null>;
    buildForwardedProps: () => Record<string, any>;
    onCtx: (ctx: AgentClientContextValue) => void;
}) {
    const { config, AgentLayer } = useAgentSetup({
        baseUrl: 'http://localhost:1234',
        agentId: 'test-agent',
        tools,
        tokenProvider,
        buildForwardedProps,
    });
    if (!config) return null;
    return (
        <AgentLayer>
            <Child onCtx={onCtx} />
        </AgentLayer>
    );
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeTools(): Record<string, ToolDefinition> {
    return {
        aTool: {
            definition: { name: 'aTool', description: '', parameters: { type: 'object', properties: {}, required: [] } },
            isFrontend: true,
            handler: () => '{}',
        },
    };
}

describe('useAgentSetup remount stability', () => {
    let ctxValue: AgentClientContextValue | null;
    beforeEach(() => { ctxValue = null; });

    it('option identity churn (tools, buildForwardedProps, tokenProvider refetch) does not remount the agent subtree', async () => {
        const onCtx = (c: AgentClientContextValue) => { ctxValue = c; };

        let view: ReturnType<typeof render> | null = null;
        await act(async () => {
            view = render(
                <Root
                    tools={makeTools()}
                    tokenProvider={async () => 'tok-1'}
                    buildForwardedProps={() => ({ v: 1 })}
                    onCtx={onCtx}
                />
            );
        });
        await act(flush);

        expect(ctxValue).not.toBeNull();
        const clientBefore = ctxValue!.agentClient;

        // Simulate conversation state that a remount would destroy.
        await act(async () => {
            ctxValue!.addMessage({ id: 'u1', role: 'user', content: 'hello' });
        });
        expect(ctxValue!.messages).toHaveLength(1);

        // Rerender with ALL churn-prone identities replaced. The new
        // tokenProvider also re-triggers the config fetch, producing a brand
        // new config object once it resolves.
        await act(async () => {
            view!.rerender(
                <Root
                    tools={makeTools()}
                    tokenProvider={async () => 'tok-2'}
                    buildForwardedProps={() => ({ v: 2 })}
                    onCtx={onCtx}
                />
            );
        });
        await act(flush);

        // Same client instance => same store => same conversation.
        expect(ctxValue!.agentClient).toBe(clientBefore);
        expect(ctxValue!.messages).toHaveLength(1);
        expect(ctxValue!.messages[0].content).toBe('hello');
        // The fresh buildForwardedProps is live (store options were updated).
        expect(ctxValue!.getForwardedProps()).toEqual({ v: 2 });
    });
});
