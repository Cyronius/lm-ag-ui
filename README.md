# @techsavvies/lm-ag-ui

React hooks and utilities for building chat interfaces powered by the [AG-UI](https://github.com/ag-ui-protocol/ag-ui) streaming protocol. The engine is framework-free — a React-free entry (`@techsavvies/lm-ag-ui/core`) exposes it for Vue, Svelte, workers, or plain TypeScript.

## Installation

```bash
npm install @techsavvies/lm-ag-ui
```

### Peer Dependencies

```json
{
  "react": ">=18",
  "rxjs": "^7.8.0",
  "@ag-ui/client": "^0.0.47",
  "@ag-ui/core": "^0.0.47"
}
```

`react` is an **optional** peer: it is required by the package root (hooks,
provider) but not by `@techsavvies/lm-ag-ui/core`, whose runtime graph imports
only `@ag-ui/client` and `rxjs`.

## Examples

- [examples/react](./examples/react) — minimal Vite chat UI over `useAgent` / `AgentProvider` (streaming render, frontend tool, `isBusy` gating)
- [examples/plain-typescript](./examples/plain-typescript) — Node console chat driving `AgentStore` directly through `/core`; no React installed

## Quick Start

Use `useAgent` to initialize the agent client and wrap your UI with `AgentProvider`:

```tsx
import { useAgent, AgentProvider, useAgentContext } from '@techsavvies/lm-ag-ui';

function App() {
  const agent = useAgent({
    baseUrl: 'http://localhost:8000',
    agentId: 'my-agent',
    tools: { /* your tool definitions */ },
  });

  return (
    <AgentProvider value={agent}>
      <ChatUI />
    </AgentProvider>
  );
}
```

Inside `AgentProvider`, access agent state via `useAgentContext`:

```tsx
import { useAgentContext } from '@techsavvies/lm-ag-ui';

function ChatUI() {
  const {
    messages,
    addMessage,
    currentMessage,
    isStreaming,
    agentClient,
    agentSubscriber,
    beginTurn,
  } = useAgentContext();

  const sendMessage = async (text: string) => {
    const userMsg = { id: `msg_${Date.now()}`, role: 'user', content: text };
    addMessage(userMsg);
    beginTurn();
    await agentClient.runAgent(
      [...messages, userMsg],
      [],
      agentSubscriber
    );
  };

  return (
    <div>
      {messages.map(m => <div key={m.id}>{m.content}</div>)}
      {isStreaming && <div>{currentMessage}</div>}
    </div>
  );
}
```

## Architecture

> **In doubt? Use `useAgent`.** It is a thin React binding over `AgentStore`, the React-free engine that owns the whole event pipeline. Construct `AgentStore` directly only when building a custom binding (another framework, a worker, a non-React app).

### Layered structure

- **Transport layer** — [src/CustomHttpAgent.ts](./src/CustomHttpAgent.ts): subclasses `@ag-ui/client`'s `HttpAgent` to route the request pipeline through a pluggable `RequestHandler`. Auth headers, retries, and custom fetch behavior hook in here.
- **Session layer** — [src/AgentClient.ts](./src/AgentClient.ts): wraps the HttpAgent with session semantics (`threadId`, `runId`, `isActive`), system-context injection with per-thread content-based deduplication, token-provider-based auth refresh, and the two entry points `runAgent()` (new turn) and `submitToolResults()` (tool feedback round-trip).
- **Engine (React-free)** — [src/AgentStore.ts](./src/AgentStore.ts): implements the AG-UI `AgentSubscriber` directly. Accumulates text deltas through the pure reducer ([src/agentReducer.ts](./src/agentReducer.ts)), buffers incremental tool calls, executes frontend tools at `RunFinished` and chains the tool-result submission, owns the run watchdog and the intermediate-message suppressor, and exposes `subscribe`/`getSnapshot` (the `useSyncExternalStore` contract, usable from any framework).
- **React binding** — [src/useAgent.ts](./src/useAgent.ts) + [src/AgentClientContext.tsx](./src/AgentClientContext.tsx): creates the store once per mount, syncs options latest-wins on each render, reads one folded snapshot via `useSyncExternalStore`, and exposes the agent state to the tree via `AgentProvider` / `useAgentContext`.

### Data flow (one user turn)

```
user input
   → addMessage(user)
   → beginTurn()   (clears stale chain marker, then agentClient.startNewRun())
   → agentClient.runAgent(history, tools, subscriber)
     → HttpAgent streams events ──→ subscriber callbacks
        ├─ TextMessageContent  → text buffer += delta
        ├─ ToolCallStart/Args  → tool buffer[id] accumulates
        ├─ ToolCallResult      → backend tool message added, onResult fired
        └─ RunFinished         → assembleFinalMessages(...),
                                 execute pending frontend tools,
                                 submitToolResults() if any ran
   → agentClient.endRun()
```

The `RunFinished` branching logic lives in the pure helper [src/assembleFinalMessages.ts](./src/assembleFinalMessages.ts), which handles the four branches (text-only / tools-only / text+tools-all-resolved / text+tools-pending) and duplicate-suppression.

### Tool system

A `ToolDefinition` bundles: OpenAI-compatible `definition`, optional `handler` (frontend execution), optional `renderer` (UI), optional `onResult` (side-effect hook fired for both frontend and backend tools), and an `isFrontend` routing flag. Frontend tools execute on `RunFinished`; backend tools execute remotely and their results arrive as `ToolCallResult` events.

Frontend handlers receive a `ctx: ToolContext` with one escape hatch:

- `ctx.stopAfterToolCall()` — ends the run with no LLM follow-up turn. It sets `forwardedProps.stopAfterToolCall = true` on the tool-result submission; a backend that honors the flag short-circuits the model entirely. Use it when the tool's output *is* the final answer (e.g. the tool rendered an artifact and there is nothing left to narrate). Idempotent and batch-scoped — if any tool in a batched submission sets it, it applies to the whole submission.

To suppress *intermediate* assistant narration during an agentic chain — keeping the first and final messages of the user's turn but dropping middle narration — set `suppressIntermediateAssistantMessages: true` on `useAgentSetup` / `useAgent` options. The flag is sticky for the lifetime of the agent component and is frontend-local (never sent to the backend). The runtime applies these rules on every run while the flag is on:

- The first text emitted in a user turn (the first `TEXT_MESSAGE_*` group seen since the user submitted) streams live as it arrives.
- Text in any subsequent run is buffered until that run's `RUN_FINISHED`. If the run emitted any tool calls (chain continues), the buffered text is dropped — it was intermediate narration. If the run had no tool calls (chain ends), the buffered text is committed as the final-result message.
- A new turn (a fresh `runAgent` call rather than a tool-result chain continuation) resets the first-text tracking. The store's tool runner signals continuation by calling `markChainedRun()` immediately before submitting tool results. Consumers calling `agentClient.runAgent` directly should start the turn with `beginTurn()` (which clears any stale chained-run marker before minting the run) rather than `agentClient.startNewRun()`; `invokeToolByName` does this automatically. `clearPendingChain()` remains as a standalone escape hatch.

### State ownership

- **Session** (`AgentClient`): `threadId`, `runId`, `isActive`.
- **Chat state** (`AgentStore`): messages, streaming buffer, tool-call buffers, per-tool global state — held as one immutable `AgentSnapshot` (`state`, `session`, `isStreaming`, `hasPendingToolWork`, `isBusy`). `useAgent` renders from that snapshot; there is no React-side copy.

### `sendFullHistory` modes

`AgentClient` (and by extension `useAgent`) accepts `sendFullHistory`:

- `true` — **stateless / frontend-controlled agents.** The frontend owns the full conversation history and ships it every turn. The backend holds no per-thread state; it can scale horizontally, be restarted, or be load-balanced freely. The library's `threadId` is still forwarded for observability / logging, but the backend does not rehydrate from it.
- `false` (default) — **stateful / backend-controlled agents.** The backend persists history against `threadId` and only needs the last turn (user message or tool results). Use this when the backend owns memory, summarization, or multi-turn context trimming.

Pick based on where history lives. Mismatching the flag with the backend contract causes either context loss (`false` against a stateless server) or duplicate history (`true` against a stateful server that also stores it).

### Configuration bootstrap

[src/configService.ts](./src/configService.ts) fetches `GET /agent/{agentId}` to retrieve backend tool configs, suggestions, and KV config. [src/useAgentSetup.ts](./src/useAgentSetup.ts) constructs the `AgentClient` lazily once config loads, so `baseUrl`/`agentId` are never captured stale. Backend tool configs can be hydrated into full `ToolDefinition`s either by the consumer (in `onConfigLoaded`) or automatically via the `frontendToolImpls` option, which joins backend-declared tools with caller-supplied handlers/renderers.

### Build & packaging

[vite.config.ts](./vite.config.ts) builds ES-only output to `dist/`, with declarations in `dist/types/`. `react`, `react-dom`, `@ag-ui/*`, and `rxjs` are external — they resolve from the consumer's install as peer dependencies. `@ag-ui/client` ships its own nested copy of rxjs, so consumers should dedupe rxjs in their bundler (`resolve.dedupe: ['rxjs']` in Vite) to keep one `Observable` identity across the boundary. That duplication is also why [src/CustomHttpAgent.ts](./src/CustomHttpAgent.ts) carries an `as any` cast at the observable boundary — documented inline.

## Core API

### `useAgent(options)`

Core hook that creates an `AgentClient` and manages streaming state, messages, and tool execution.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `baseUrl` | `string` | Yes | Backend server URL |
| `agentId` | `string` | Yes | Agent identifier |
| `tokenProvider` | `() => Promise<string \| null>` | No | Auth token provider |
| `requestHandler` | `RequestHandler` | No | Custom fetch implementation (e.g., for session management) |
| `timeout` | `number` | No | Request timeout in ms (default: 300000) |
| `tools` | `Record<string, ToolDefinition>` | No | Tool definitions |
| `buildForwardedProps` | `() => Record<string, any>` | No | Props injected into each agent call via `RunAgentInput.forwardedProps` |
| `sendFullHistory` | `boolean` | No | Send full message history vs. only the latest turn (default: false) |
| `initialThreadId` | `string` | No | Resume an existing conversation thread |
| `onLifecycleEvent` | `(event: AgentLifecycleEvent) => void` | No | Callback for observing agent lifecycle events (run started, tool used, message added) |
| `systemContextBuilder` | `() => string \| null` | No | Zero-arg renderer for the system-context snapshot. When not provided, no system context is injected. Independent of `buildForwardedProps` |
| `debug` | `boolean` | No | Enable backend LLM-input capture (appends `?debug=true` to the agent URL). Set once at init; drive from env var or URL flag |
| `onError` | `(err: AgentError) => void` | No | Fires on run errors, timeout aborts, intentional aborts, and the chained-tool-turn cap (`code`: `'run_error' \| 'timeout' \| 'aborted' \| 'max_tool_turns'`). Additive to in-stream error messages |
| `onCustomEvent` | `(event: CustomEvent) => void` | No | Fires for every AG-UI `CUSTOM` event (`event.name`, `event.value`). The library does not interpret these — fold them into your own state here rather than patching the subscriber |
| `maxToolTurns` | `number` | No | Cap on chained run→frontend-tool→run continuations per user turn. On breach the chain is cut, an error message is added, and `onError` fires with `code: 'max_tool_turns'` (default: 8) |
| `safetyTimeoutMs` | `number` | No | Absolute hard cap for a whole run, never reset (default: 900000) |
| `idleTimeoutMs` | `number` | No | Idle window, reset on every AG-UI event — only a genuine stall trips it (default: 180000) |
| `pruneOutboundMessages` | `(messages: Message[]) => Message[]` | No | Outbound transformer applied immediately before every wire send. Must preserve ordering and tool-call/tool-result pairing — only `content` may change |
| `suppressIntermediateAssistantMessages` | `boolean` | No | Drop middle narration in agentic chains; keep the first and final messages of the turn (default: false) |
| `configParams` | `Record<string, string \| string[]>` | No | Extra query params appended to both the config-init GET and every run POST. Array values are sent as repeated keys (`?ids=a&ids=b`) |

Returns: `AgentClientContextValue` with all agent state and methods.

**Busy state:** `isStreaming` reads false while frontend tools are executing between runs. Use `isBusy` (`isStreaming || hasPendingToolWork`) to gate the send button and typing indicators — otherwise a second message can race the pending tool chain's continuation call on the same thread.

### `AgentClient`

Service class wrapping AG-UI's `HttpAgent` for backend communication.

```ts
const client = new AgentClient('http://localhost:8000', 'my-agent', {
  tokenProvider: async () => getAccessToken(),
  timeout: 60000,
  sendFullHistory: false,
});
```

Key methods:
- `startNewRun()` / `endRun()` / `endSession()` - Session lifecycle. To start a fresh user turn, prefer `beginTurn()` on the context value / `AgentStore` — it clears the store's chained-run marker before calling `startNewRun()`
- `runAgent(messages, tools, subscriber, forwardedProps)` - Send messages to backend
- `submitToolResults(messages, subscriber, tools, forwardedProps)` - Submit tool execution results
- `abortRun()` - Abort the current streaming run
- `getConfig()` - Returns `{ baseUrl, agentId, timeout }`

## Tool System

Tools define capabilities the agent can invoke. Each tool can run on the frontend (in React) or the backend (on the server).

```tsx
import type { ToolDefinition } from '@techsavvies/lm-ag-ui';

const myTool: ToolDefinition = {
  definition: {
    name: 'show_calendar',
    description: 'Shows a calendar booking widget',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  isFrontend: true,
  handler: (args, updateState, getState, configJson, ctx) => {
    // Execute tool logic, return result string
    ctx?.stopAfterToolCall();   // optional: when the artifact IS the answer
    return JSON.stringify({ shown: true });
  },
  renderer: (args, result, updateState, getState) => {
    // Return React element to display
    return <CalendarWidget />;
  },
  onResult: (args, result, updateState, getState) => {
    // Side effects when result is received (e.g., accumulation)
  },
};
```

Handlers may return `string | null` or a `Promise<string | null>` — the runner awaits the return either way, so an async tool opts in simply by being declared `async`.

| Field | Type | Description |
|-------|------|-------------|
| `definition` | `StandardTool` | OpenAI-compatible tool schema |
| `isFrontend` | `boolean` | `true` = runs in React, `false` = runs on server |
| `handler` | `ToolHandler` | Executes tool logic (frontend tools only) |
| `renderer` | `ToolRenderer` | React component for displaying results |
| `onResult` | `ToolOnResult` | Callback when tool result is received |
| `configJson` | `Record<string, unknown>` | Tool configuration from backend |

## File Attachments

The library supports file attachments via AG-UI's native `BinaryInputContent` type. Two strategies are available:

### Inline base64 (simple, no upload infrastructure)

Use `filesToBinaryContent()` to read files client-side and embed them directly in message content:

```ts
import { filesToBinaryContent } from '@techsavvies/lm-ag-ui';

const binaryParts = await filesToBinaryContent(files);
const message = {
  id: `msg_${Date.now()}`,
  role: 'user',
  content: [
    ...binaryParts,
    { type: 'text', text: 'Process these files' }
  ]
};
```

### URL reference (large files, existing upload infrastructure)

Upload files to your own storage, then reference them via `BinaryInputContent.url`:

```ts
import type { BinaryInputContent } from '@techsavvies/lm-ag-ui';

// Upload to your own endpoint
const uploaded = await myUploadService(files);

const binaryParts: BinaryInputContent[] = uploaded.map(f => ({
  type: 'binary',
  mimeType: f.mimeType,
  url: f.downloadUrl,
  filename: f.filename,
}));

const message = {
  id: `msg_${Date.now()}`,
  role: 'user',
  content: [...binaryParts, { type: 'text', text: 'Process these files' }]
};
```

## Lifecycle Events

Observe agent events for analytics or tracking without coupling your app to the library internals:

```ts
useAgent({
  baseUrl: 'http://localhost:8000',
  agentId: 'my-agent',
  onLifecycleEvent: (event) => {
    switch (event.type) {
      case 'run_started':
        analytics.trackInteractionStart();
        break;
      case 'tool_used':
        analytics.trackToolUsage(event.toolName);
        break;
      case 'message_added':
        analytics.trackMessage(event.role, event.content);
        break;
    }
  },
});
```

## Authentication

Inject auth via `tokenProvider`:

```ts
useAgent({
  baseUrl: 'http://localhost:8000',
  agentId: 'my-agent',
  tokenProvider: async () => {
    const session = await getSession();
    return session?.accessToken ?? null;
  },
});
```

## Custom HTTP Pipeline

Use `requestHandler` to inject middleware (retries, session management):

```ts
useAgent({
  baseUrl: 'http://localhost:8000',
  agentId: 'my-agent',
  requestHandler: async (url, init) => {
    // Add custom headers, retry logic, etc.
    return fetch(url, { ...init, headers: { ...init?.headers, 'X-Custom': 'value' } });
  },
});
```

## Config Loading (optional)

If your backend provides a `GET /agent/{agentId}` endpoint that returns tool definitions and suggestions, `useAgentSetup` loads it and mounts the agent once config is ready:

```tsx
import { useAgentSetup } from '@techsavvies/lm-ag-ui';
import type { AgentConfig } from '@techsavvies/lm-ag-ui';

function App() {
  const { config, isLoading, error, AgentLayer } = useAgentSetup({
    baseUrl: 'http://localhost:8000',
    agentId: 'my-agent',
    onConfigLoaded: (config: AgentConfig) => {
      // Transform config, merge tool definitions, etc.
      return config;
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <AgentLayer>
      <ChatUI />
    </AgentLayer>
  );
}
```

`useAgentSetup` loads config, then mounts `useAgent` + `AgentProvider` inside `AgentLayer`. This is a convenience wrapper — you can always use `useAgent` directly if you manage config loading yourself.

### Auto-hydrating tools from backend configs

The backend owns each tool's schema and `configJson`; the frontend owns the code that runs handlers and renders results. For the common case, pass `frontendToolImpls` to `useAgentSetup` and let it join them for you:

```tsx
import { useAgentSetup } from '@techsavvies/lm-ag-ui';

const frontendToolImpls = {
  show_calendar: {
    isFrontend: true,
    handler: (args, updateState, getState) => JSON.stringify({ shown: true }),
    renderer: () => <CalendarWidget />,
  },
  // backend-only tools can be omitted — they'll still be registered from the backend config
};

const { config, AgentLayer } = useAgentSetup({
  baseUrl,
  agentId,
  frontendToolImpls,
});
```

For full control (conditional tool registration, runtime filtering), use `onConfigLoaded` instead and call `hydrateToolConfigs(loadedConfig.toolConfigs, frontendToolImpls)` yourself.

### Config loading API

| Export | Description |
|--------|-------------|
| `useAgentSetup(options)` | Hook: loads config + initializes agent |
| `loadAgentConfig(baseUrl, agentId, tokenProvider?, requestHandler?, timeout?)` | Standalone function to load config |
| `AgentConfig` | Config response type (tools, suggestions, config KV pairs) |
| `Suggestion` | Suggestion type |
| `ToolConfigResponse` | Raw tool config from API |

## Exports

Two entry points:

- **`@techsavvies/lm-ag-ui`** (root) — everything below, including the React bindings.
- **`@techsavvies/lm-ag-ui/core`** — everything except `useAgent`, `useAgentSetup`, `AgentProvider`, `useAgentContext`. Zero React in its runtime graph; use it from non-React apps (see [examples/plain-typescript](./examples/plain-typescript)). The only React trace is type-level (`ToolDefinition.renderer` returns a `ReactElement`) — erased at build, and non-React consumers simply leave `renderer` unset.

**Classes**: `AgentClient`, `HttpAgent` (re-export from `@ag-ui/client`)

**Hooks**: `useAgent`, `useAgentContext`, `useAgentSetup`

**Components**: `AgentProvider`

**Functions**: `filesToBinaryContent`, `loadAgentConfig`, `hydrateToolConfigs`, `getAllToolDefinitions`, `getFrontendToolDefinitions`, `getBackendToolDefinitions`, `getFrontEndTools`, `getToolRenderers`, `groupSuggestionsByCategory`

**Types**: `ToolDefinition`, `ToolHandler`, `ToolRenderer`, `ToolOnResult`, `ToolContext`, `AgentClientContextValue`, `UseAgentOptions`, `UseAgentSetupOptions`, `UseAgentSetupResult`, `AgentConfig`, `Suggestion`, `ToolConfigResponse`, `AgentLifecycleEvent`, `AgentError`, `AgentErrorCode`, `Session`, `TokenProvider`, `RequestHandler`, `SystemContextBuilder`, `BinaryInputContent`, `InputContent`, AG-UI re-exports (`Message`, `Tool`, `BaseEvent`, `EventType`, and all event types)

**Advanced** — lower-level building blocks; most consumers want `useAgent`: `AgentStore` (with `AgentStoreOptions`, `AgentSnapshot`, `RunFinishedPayload`, `PendingToolCall`), `executeFrontendToolCall` (with `FrontendToolExecution`)

## Migrating from 1.x

2.0 replaces the internal hook composition with the React-free `AgentStore`. The `useAgent` / `useAgentSetup` facades and `AgentClientContextValue` are signature-compatible — most consumers upgrade with no code changes.

Breaking changes:

- **Removed**: `useAgentSession`, `useAgentStream`, `useFrontendToolRunner` and their types (`SessionHandle`, `StreamHandle`, `FrontendToolRunnerOptions`). If you composed these for a custom runner, construct an `AgentStore` instead: it implements `AgentSubscriber`, exposes `onRunFinished(cb)`, `beginTurn()`, `markChainedRun()`, `clearPendingChain()`, `dispatch(action)`, and the `subscribe`/`getSnapshot` pair for state.
- **`agentSubscriber`** on the context value is now the store itself (still a valid `AgentSubscriber`). Its handlers are class properties — assigning your own handler keys onto it (e.g. `agentSubscriber.onCustomEvent = …`) overwrites the store's. Use the `onCustomEvent` option instead.
- **Package renamed** from `@cyronius/lm-ag-ui` / `@itkennel/lm-ag-ui` to `@techsavvies/lm-ag-ui`. Update imports; the API is otherwise the same as 1.1.0 / 1.0.276.

New in 2.0:

- `onCustomEvent` option on `useAgent` / `useAgentSetup` / `AgentStore`.
- `maxToolTurns` option (default 8) — cuts a runaway frontend-tool chain; `onError` gains `code: 'max_tool_turns'`.
- `useAgentSetup` now accepts `onError`.

Behavior fixes (deliberate):

- A backend tool result followed by trailing assistant text (with `suppressIntermediateAssistantMessages` on) is now recorded as `assistant(toolCalls) → tool → assistant(text)`. Previously the trailing text landed between the tool result and its owner, and the orphaned result was dropped on the next full-history send.

- `isBusy` / `hasPendingToolWork` now reset when a chained run errors, times out, is terminated, or has nothing submittable. Previously they could stick `true` forever after a mid-chain failure.
- `useAgentSetup`'s `AgentLayer` no longer remounts (destroying the conversation) when option identities change (an unmemoized `tools`, an inline `buildForwardedProps`, a config refetch). Only `baseUrl`/`agentId` changes remount. A rotated `tokenProvider` now takes effect without a remount via `AgentClient.setTokenProvider`.

## Development

```bash
npm install     # also runs the build via `prepare`
npm test        # vitest
npm run build   # ES bundle + declarations into dist/
```

## License

MIT © Cyrus Attoun
