# Plain TypeScript example (no React)

A Node console chat that drives `AgentStore` directly through the React-free
`@techsavvies/lm-ag-ui/core` entry — proof the engine (streaming, reducer,
frontend tool execution, chained tool-result submission, watchdog) needs no
framework.

## What it demonstrates

- Constructing `AgentClient` + `AgentStore` by hand
- The `subscribe`/`getSnapshot` contract (the same one `useSyncExternalStore`
  consumes in React) used to render streaming deltas to stdout
- A frontend tool (`get_local_time`) executed locally by the store's runner
  when the agent calls it
- Waiting for `isBusy` to settle — the signal that a multi-hop, tool-calling
  turn has truly finished (a run's stream ending is not the end of the turn)

## Run

Point it at any AG-UI backend:

```bash
npm install
AGENT_BASE_URL=http://localhost:8000 AGENT_ID=my-agent npm start
```

Note `sendFullHistory: true` in [src/main.ts](./src/main.ts): this example owns
the conversation history client-side. If your backend rehydrates history from
`threadId`, set it to `false` — see the root README's `sendFullHistory` section.
