/**
 * Console chat driving AgentStore directly — no React anywhere.
 *
 * The store is the same engine `useAgent` binds to in the browser: it
 * implements the AG-UI AgentSubscriber, runs the reducer, executes frontend
 * tools at RunFinished, and chains tool-result submissions automatically.
 * Here we consume it through its framework-agnostic subscribe/getSnapshot
 * contract from plain Node.
 *
 * Run against any AG-UI backend:
 *   AGENT_BASE_URL=http://localhost:8000 AGENT_ID=my-agent npm start
 */
import * as readline from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import {
    AgentClient,
    AgentStore,
    getAllToolDefinitions,
    type AgentSnapshot,
    type ToolDefinition,
} from '@cyronius/lm-ag-ui/core';

const baseUrl = process.env.AGENT_BASE_URL ?? 'http://localhost:8000';
const agentId = process.env.AGENT_ID ?? 'demo';

// A frontend tool: executed locally by the store's tool runner when the agent
// calls it, with the result submitted back over the wire automatically.
const tools: Record<string, ToolDefinition> = {
    get_local_time: {
        definition: {
            name: 'get_local_time',
            description: "Returns the user's current local date and time.",
            parameters: { type: 'object', properties: {}, required: [] },
        },
        isFrontend: true,
        handler: () => JSON.stringify({ now: new Date().toString() }),
    },
};

const client = new AgentClient(baseUrl, agentId, {
    // This example owns the conversation history and ships it every turn
    // (stateless backend). Set false if your backend rehydrates from threadId.
    sendFullHistory: true,
});
const store = new AgentStore(client, {
    tools,
    onError: (err) => console.error(`\n[${err.code}] ${err.message}`),
});

// Render streaming output: print text deltas as they arrive, and completed
// assistant messages once (the streaming buffer is committed at RunFinished,
// so we track what we've already echoed).
let printedStreamLength = 0;
let printedMessageCount = 0;

store.subscribe(() => {
    const snap: AgentSnapshot = store.getSnapshot();

    // New streaming text since last notification → write the delta.
    const streaming = snap.state.streamingText;
    if (streaming.length > printedStreamLength) {
        process.stdout.write(streaming.slice(printedStreamLength));
        printedStreamLength = streaming.length;
    } else if (streaming.length === 0) {
        printedStreamLength = 0;
    }

    // Newly committed messages (tool results, error messages, buffered text).
    const messages = snap.state.messages;
    for (let i = printedMessageCount; i < messages.length; i++) {
        const m = messages[i];
        if (m.role === 'tool') {
            process.stdout.write(`\n[tool result] ${m.content}\n`);
        }
    }
    printedMessageCount = messages.length;
});

/** Resolves once the whole turn settles — including chained tool round-trips. */
function waitUntilIdle(): Promise<void> {
    if (!store.getSnapshot().isBusy) return Promise.resolve();
    return new Promise((resolve) => {
        const unsub = store.subscribe(() => {
            if (!store.getSnapshot().isBusy) {
                unsub();
                resolve();
            }
        });
    });
}

async function sendMessage(text: string): Promise<void> {
    store.addMessage({ id: randomUUID(), role: 'user', content: text });
    // Fresh user turn: clears any stale chained-run marker and mints a run.
    store.beginTurn();
    try {
        // The store is the subscriber. runAgent resolves when this leg's SSE
        // stream ends; chained frontend-tool legs continue in the background,
        // so we wait for isBusy to settle before prompting again.
        await client.runAgent(store.getState().messages, getAllToolDefinitions(tools), store);
    } catch (error) {
        console.error('Run failed:', error);
        client.endRun();
        return;
    }
    await waitUntilIdle();
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Connected to ${baseUrl}/agent/${agentId} — type a message ("exit" to quit)\n`);

for (;;) {
    const line = (await rl.question('you> ')).trim();
    if (!line || line === 'exit') break;
    process.stdout.write('agent> ');
    await sendMessage(line);
    process.stdout.write('\n');
}

store.dispose();
rl.close();
