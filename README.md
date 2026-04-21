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

The simplest way to get started is with `useAgentSetup`, which handles config loading and agent initialization:

```tsx
import { useAgentSetup, AgentProvider } from '@itkennel/lm-ag-ui';

function App() {
  const { config, isLoading, error, AgentLayer } = useAgentSetup({
    baseUrl: 'http://localhost:8000',
    agentId: 'my-agent',
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

Inside `AgentLayer`, access agent state via `useAgentContext`:

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

### `useAgentSetup(options)`

Combined hook that loads agent config from the backend and initializes the agent client.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `baseUrl` | `string` | Yes | Backend server URL |
| `agentId` | `string` | Yes | Agent identifier |
| `tokenProvider` | `() => Promise<string \| null>` | No | Auth token provider |
| `requestHandler` | `RequestHandler` | No | Custom fetch implementation (e.g., for session management) |
| `timeout` | `number` | No | Request timeout in ms (default: 300000) |
| `tools` | `Record<string, ToolDefinition>` | No | Tool definitions (overrides config) |
| `buildForwardedProps` | `() => Record<string, any>` | No | Dynamic context injected into each agent call |
| `onConfigLoaded` | `(config: AgentConfig) => AgentConfig` | No | Transform config after loading |

Returns: `{ config, isLoading, error, AgentLayer }`

### `useAgent(options)`

Lower-level hook for when you manage config loading yourself. Same options as `useAgentSetup` minus `onConfigLoaded`.

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
- `uploadFile(files, threadId?)` - Upload files to the agent
- `setDebug(enabled)` - Toggle debug mode (appends `?debug=true` to agent URL)
- `abortRun()` - Abort the current streaming run

### `loadAgentConfig(baseUrl, agentId, tokenProvider?, requestHandler?, timeout?)`

Standalone function to load agent configuration from the backend. Config loading has a 30s default timeout.

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

## Authentication

Inject auth via `tokenProvider`:

```ts
useAgentSetup({
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
useAgentSetup({
  baseUrl: 'http://localhost:8000',
  agentId: 'my-agent',
  requestHandler: async (url, init) => {
    // Add custom headers, retry logic, etc.
    return fetch(url, { ...init, headers: { ...init?.headers, 'X-Custom': 'value' } });
  },
});
```

## Exports

### Classes
- `AgentClient` - HTTP agent client
- `CustomHttpAgent` (via `HttpAgent` re-export) - Custom request pipeline agent

### Hooks
- `useAgent` - Core agent state hook
- `useAgentSetup` - Config loading + agent initialization
- `useAgentContext` - Access agent context from child components

### Components
- `AgentProvider` - React context provider

### Functions
- `loadAgentConfig` - Load agent configuration

### Types
- `ToolDefinition`, `ToolHandler`, `ToolRenderer`, `ToolOnResult`
- `AgentClientContextValue`, `UseAgentOptions`, `UseAgentSetupOptions`
- `AgentConfig`, `Session`, `Suggestion`, `TokenProvider`, `RequestHandler`
- AG-UI re-exports: `Message`, `Tool`, `BaseEvent`, `EventType`, and all event types
