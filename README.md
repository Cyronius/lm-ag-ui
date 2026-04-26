# @itkennel/lm-ag-ui

React hooks and utilities for building chat interfaces powered by the [AG-UI](https://github.com/ag-ui-protocol/ag-ui) streaming protocol.

## Installation

```bash
npm install @itkennel/lm-ag-ui
```

### Peer Dependencies

```json
{
  "react": ">=18",
  "@ag-ui/client": "^0.0.47",
  "@ag-ui/core": "^0.0.47"
}
```

## Quick Start

Use `useAgent` to initialize the agent client and wrap your UI with `AgentProvider`:

```tsx
import { useAgent, AgentProvider, useAgentContext } from '@itkennel/lm-ag-ui';

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
import { useAgentContext } from '@itkennel/lm-ag-ui';

function ChatUI() {
  const {
    messages,
    addMessage,
    currentMessage,
    isStreaming,
    agentClient,
    agentSubscriber,
  } = useAgentContext();

  const sendMessage = async (text: string) => {
    const userMsg = { id: `msg_${Date.now()}`, role: 'user', content: text };
    addMessage(userMsg);
    agentClient.startNewRun();
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

### Layered structure

- **Transport layer** — [CustomHttpAgent.ts](./CustomHttpAgent.ts): subclasses `@ag-ui/client`'s `HttpAgent` to route the request pipeline through a pluggable `RequestHandler`. Auth headers, retries, and custom fetch behavior hook in here.
- **Session layer** — [AgentClient.ts](./AgentClient.ts): wraps the HttpAgent with session semantics (`threadId`, `runId`, `isActive`), system-context injection with per-thread content-based deduplication, token-provider-based auth refresh, and the two entry points `runAgent()` (new turn) and `submitToolResults()` (tool feedback round-trip).
- **React layer** — [useAgent.ts](./useAgent.ts) + [AgentClientContext.tsx](./AgentClientContext.tsx): subscribes to AG-UI streaming events, accumulates text deltas, buffers incremental tool calls, executes frontend tools at `RunFinished`, and exposes the agent state to the tree via `AgentProvider` / `useAgentContext`.

### Data flow (one user turn)

```
user input
   → addMessage(user)
   → agentClient.startNewRun()
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

The `RunFinished` branching logic lives in the pure helper [assembleFinalMessages.ts](./assembleFinalMessages.ts), which handles the four branches (text-only / tools-only / text+tools-all-resolved / text+tools-pending) and duplicate-suppression.

### Tool system

A `ToolDefinition` bundles: OpenAI-compatible `definition`, optional `handler` (frontend execution), optional `renderer` (UI), optional `onResult` (side-effect hook fired for both frontend and backend tools), and an `isFrontend` routing flag. Frontend tools execute synchronously on `RunFinished`; backend tools execute remotely and their results arrive as `ToolCallResult` events.

Frontend handlers receive a `ctx: ToolContext` with two escape hatches:
- `ctx.stopAfterToolCall()` — terminates the run; no LLM follow-up turn (backend spec `AGENT-STOP-FRONTEND-CONTEXT`).
- `ctx.suppressAssistantMessages()` — keeps the agentic loop running but filters assistant `TextMessage` events from the next turn (backend spec `AGENT-SUPPRESS-ASSISTANT-MESSAGES`). Use this when you want a UI artifact without chat narration but still want the LLM to be able to chain into another tool call. If both flags are set, `stopAfterToolCall` wins.

### State ownership

- **Session** (`AgentClient`): `threadId`, `runId`, `isActive`.
- **Chat state** (`useAgent`): messages, streaming buffer, tool-call buffers, per-tool global state.

### `sendFullHistory` modes

`AgentClient` (and by extension `useAgent`) accepts `sendFullHistory`:

- `true` — **stateless / frontend-controlled agents.** The frontend owns the full conversation history and ships it every turn. The backend holds no per-thread state; it can scale horizontally, be restarted, or be load-balanced freely. The library's `threadId` is still forwarded for observability / logging, but the backend does not rehydrate from it.
- `false` (default) — **stateful / backend-controlled agents.** The backend persists history against `threadId` and only needs the last turn (user message or tool results). Use this when the backend owns memory, summarization, or multi-turn context trimming.

Pick based on where history lives. Mismatching the flag with the backend contract causes either context loss (`false` against a stateless server) or duplicate history (`true` against a stateful server that also stores it).

### Configuration bootstrap

[configService.ts](./configService.ts) fetches `GET /agent/{agentId}` to retrieve backend tool configs, suggestions, and KV config. [useAgentSetup.ts](./useAgentSetup.ts) constructs the `AgentClient` lazily once config loads, so `baseUrl`/`agentId` are never captured stale. Backend tool configs can be hydrated into full `ToolDefinition`s either by the consumer (in `onConfigLoaded`) or automatically via the `frontendToolImpls` option, which joins backend-declared tools with caller-supplied handlers/renderers.

### Build & packaging

[vite.config.lib.ts](../../vite.config.lib.ts) builds ES-only output to `dist-lib/`, marks React, `@ag-ui/*`, and `rxjs` as external, and aliases `rxjs` to the project root to defeat `@ag-ui/client`'s bundled copy. The bundled-rxjs collision is also why [CustomHttpAgent.ts](./CustomHttpAgent.ts) has an `as any` cast at the observable boundary — documented inline.

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
| `systemContextBuilder` | `() => string \| null` | No | Zero-arg renderer for the system-message snapshot. When not provided, no system context is injected. Independent of `buildForwardedProps` |
| `debug` | `boolean` | No | Enable backend LLM-input capture (appends `?debug=true` to the agent URL). Set once at init; drive from env var or URL flag |
| `onError` | `(err: { code; message; raw? }) => void` | No | Fires on run errors, safety-timeout aborts, and intentional aborts. Additive to in-stream error messages |
| `safetyTimeoutMs` | `number` | No | Force-end a run stuck longer than this (default: 300000) |

Returns: `AgentClientContextValue` with all agent state and methods.

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
- `startNewRun()` / `endRun()` / `endSession()` - Session lifecycle
- `runAgent(messages, tools, subscriber, forwardedProps)` - Send messages to backend
- `submitToolResults(messages, subscriber, tools, forwardedProps)` - Submit tool execution results
- `abortRun()` - Abort the current streaming run
- `getConfig()` - Returns `{ baseUrl, agentId, timeout }`

## Tool System

Tools define capabilities the agent can invoke. Each tool can run on the frontend (in React) or the backend (on the server).

```ts
import type { ToolDefinition } from '@itkennel/lm-ag-ui';

const myTool: ToolDefinition = {
  definition: {
    name: 'show_calendar',
    description: 'Shows a calendar booking widget',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  isFrontend: true,
  handler: (args, updateState, getState) => {
    // Execute tool logic, return result string
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
import { filesToBinaryContent } from '@itkennel/lm-ag-ui';

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
import type { BinaryInputContent } from '@itkennel/lm-ag-ui';

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

If your backend provides a `GET /agent/{agentId}` endpoint that returns tool definitions and suggestions, you can use the config loading subpath:

```tsx
import { useAgentSetup } from '@itkennel/lm-ag-ui/config';
import type { AgentConfig } from '@itkennel/lm-ag-ui/config';

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

`useAgentSetup` loads config, then mounts `useAgent` + `AgentProvider` inside `AgentLayer` once config is ready. This is a convenience wrapper — you can always use `useAgent` directly if you manage config loading yourself.

#### Auto-hydrating tools from backend configs

The backend owns each tool's schema and `configJson`; the frontend owns the code that runs handlers and renders results. For the common case, pass `frontendToolImpls` to `useAgentSetup` and let it join them for you:

```tsx
import { useAgentSetup } from '@itkennel/lm-ag-ui/config';

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

### Main entry point (`@itkennel/lm-ag-ui`)

**Classes**: `AgentClient`, `HttpAgent` (re-export from @ag-ui/client)

**Hooks**: `useAgent`, `useAgentContext`

**Components**: `AgentProvider`

**Functions**: `filesToBinaryContent`

**Types**: `ToolDefinition`, `ToolHandler`, `ToolRenderer`, `ToolOnResult`, `AgentClientContextValue`, `UseAgentOptions`, `AgentLifecycleEvent`, `Session`, `TokenProvider`, `RequestHandler`, `BinaryInputContent`, `InputContent`, AG-UI re-exports (`Message`, `Tool`, `BaseEvent`, `EventType`, and all event types)

### Config subpath (`@itkennel/lm-ag-ui/config`)

**Hooks**: `useAgentSetup`

**Functions**: `loadAgentConfig`

**Types**: `AgentConfig`, `Suggestion`, `ToolConfigResponse`, `UseAgentSetupOptions`, `UseAgentSetupResult`
