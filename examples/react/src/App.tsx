/**
 * Minimal chat UI over useAgent.
 *
 * useAgent creates the AgentStore + AgentClient once per mount and exposes
 * everything through AgentClientContextValue. AgentProvider shares that value
 * with the tree; Chat consumes it via useAgentContext.
 *
 * Point it at any AG-UI backend:
 *   VITE_AGENT_BASE_URL=http://localhost:8000 VITE_AGENT_ID=my-agent npm run dev
 */
import { useMemo, useState } from 'react';
import {
    useAgent,
    AgentProvider,
    useAgentContext,
    getAllToolDefinitions,
    type ToolDefinition,
} from '@cyronius/lm-ag-ui';

const BASE_URL = import.meta.env.VITE_AGENT_BASE_URL ?? 'http://localhost:8000';
const AGENT_ID = import.meta.env.VITE_AGENT_ID ?? 'demo';

export function App() {
    // Frontend tool: runs in the browser when the agent calls it; the result
    // is submitted back to the agent automatically. Memoized so its identity
    // is stable (not required for correctness — options sync latest-wins —
    // but avoids pointless recomputation).
    const tools = useMemo<Record<string, ToolDefinition>>(() => ({
        get_local_time: {
            definition: {
                name: 'get_local_time',
                description: "Returns the user's current local date and time.",
                parameters: { type: 'object', properties: {}, required: [] },
            },
            isFrontend: true,
            handler: () => JSON.stringify({ now: new Date().toString() }),
        },
    }), []);

    const agent = useAgent({
        baseUrl: BASE_URL,
        agentId: AGENT_ID,
        tools,
        // This example owns the conversation history and ships it every turn
        // (stateless backend). Set false if your backend rehydrates from threadId.
        sendFullHistory: true,
        onError: (err) => console.error(`[${err.code}]`, err.message),
    });

    return (
        <AgentProvider value={agent}>
            <Chat />
        </AgentProvider>
    );
}

function Chat() {
    const {
        agentClient,
        agentSubscriber,  // the AgentStore itself — pass it to runAgent
        messages,
        currentMessage,   // streaming text buffer (live during a run)
        isBusy,           // true until the whole turn settles, incl. tool chains
        tools,
        addMessage,
        beginTurn,
    } = useAgentContext();
    const [input, setInput] = useState('');

    async function send() {
        const text = input.trim();
        if (!text || isBusy) return;
        setInput('');
        const userMessage = { id: crypto.randomUUID(), role: 'user' as const, content: text };
        addMessage(userMessage);
        beginTurn();
        try {
            // The store handles everything from here: streaming, frontend tool
            // execution, chained tool-result submission.
            await agentClient.runAgent(
                [...messages, userMessage],
                getAllToolDefinitions(tools),
                agentSubscriber
            );
        } catch (error) {
            console.error('Run failed:', error);
            agentClient.endRun();
        }
    }

    return (
        <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'system-ui, sans-serif' }}>
            <h1 style={{ fontSize: '1.2rem' }}>lm-ag-ui React example</h1>
            <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, minHeight: 300 }}>
                {messages.map((m) => (
                    <p key={m.id} style={{ whiteSpace: 'pre-wrap' }}>
                        <b>{m.role}:</b>{' '}
                        {typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}
                    </p>
                ))}
                {currentMessage && (
                    <p style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>
                        <b>assistant:</b> {currentMessage}
                    </p>
                )}
                {isBusy && !currentMessage && <p style={{ opacity: 0.5 }}>thinking…</p>}
            </div>
            <form
                onSubmit={(e) => { e.preventDefault(); void send(); }}
                style={{ display: 'flex', gap: 8, marginTop: 12 }}
            >
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Say something…"
                    style={{ flex: 1, padding: 8 }}
                />
                <button type="submit" disabled={isBusy || !input.trim()}>
                    Send
                </button>
            </form>
        </main>
    );
}
