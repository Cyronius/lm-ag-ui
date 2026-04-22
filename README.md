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
| `buildForwardedProps` | `() => Record<string, any>` | No | Dynamic context injected into each agent call via `RunAgentInput.forwardedProps` |
| `sendFullHistory` | `boolean` | No | Send full message history vs. only the latest turn (default: false) |
| `initialThreadId` | `string` | No | Resume an existing conversation thread |
| `onLifecycleEvent` | `(event: AgentLifecycleEvent) => void` | No | Callback for observing agent lifecycle events (run started, tool used, message added) |
| `injectForwardedPropsAsSystemMessage` | `boolean` | No | Also prepend forwardedProps as a system message for backends that don't read `RunAgentInput.forwardedProps` (default: false) |

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
- `setDebug(enabled)` - Toggle debug mode (appends `?debug=true` to agent URL)
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
