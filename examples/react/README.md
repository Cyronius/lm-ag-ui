# React example

A minimal Vite + React chat UI over `useAgent` / `AgentProvider` /
`useAgentContext`.

## What it demonstrates

- `useAgent` with a frontend tool (`get_local_time`) executed in the browser
- Streaming rendering via `currentMessage` (the live text buffer)
- Gating the send button on `isBusy` — the settled-turn signal that stays true
  across frontend tool chains, unlike `isStreaming`
- Starting a turn by hand: `addMessage` → `clearPendingChain` →
  `startNewRun` → `runAgent(history, toolDefs, agentSubscriber)`

For config-driven bootstrapping (backend-declared tools, suggestions), see
`useAgentSetup` in the root README — this example wires `useAgent` directly to
keep the moving parts visible.

## Run

Point it at any AG-UI backend:

```bash
npm install
VITE_AGENT_BASE_URL=http://localhost:8000 VITE_AGENT_ID=my-agent npm run dev
```

Note `sendFullHistory: true` in [src/App.tsx](./src/App.tsx): this example owns
the conversation history client-side. If your backend rehydrates history from
`threadId`, set it to `false` — see the root README's `sendFullHistory` section.
