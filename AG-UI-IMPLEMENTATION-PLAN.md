# AG-UI Implementation Plan - Revised

## Overview
Transform the current chat interface to use AG-UI protocol for real-time, streaming agent communication with proper tool execution flow and session management.

## Current State Analysis

### Existing Architecture
- React + TypeScript frontend with MUI components
- Custom message types (`Content`, `Part`, `ChatEvent`) - **can be completely replaced**
- Basic communication via `/smarketing` endpoint
- Session management (currently disabled)
- Markdown rendering for responses

### Key Changes from Original Plan
- **Complete rewrite acceptable** - no migration needed
- **Proper tool execution flow** - accumulate arguments, execute on `TOOL_CALL_END`
- **Environment-based configuration** - no hardcoded URLs
- **Robust error handling** - timeouts, partial parsing, failed tools
- **Session lifecycle management** - client-side thread/run ID tracking

## AG-UI Protocol Implementation

### Core Event Flow
1. **RUN_STARTED** - Agent begins processing
2. **TEXT_MESSAGE_CHUNK** - Streaming text deltas
3. **TOOL_CALL_START** - Tool invocation begins
4. **TOOL_CALL_ARGS** - Tool arguments streamed (multiple events)
5. **TOOL_CALL_END** - Tool arguments complete, execute tool
6. **Tool Result** - Frontend sends result back as tool message
7. **RUN_FINISHED** - Agent completes

### Tool Execution Architecture
- **All tools** sent to backend in standard AG-UI format
- **Backend** calls whatever tools the LLM decides to use
- **Frontend** intercepts tool calls it can handle locally
- **Backend tools** execute on server, results in message content
- **Frontend tools** execute locally, results sent back as tool messages

## Implementation Plan

### Phase 1: Core AG-UI Integration (3-4 hours)

#### 1.1 Environment Setup
```bash
# Add to .env
REACT_APP_AGENT_URL=http://localhost:8000/smarketing
```

#### 1.2 Install Dependencies
```bash
npm install @ag-ui/client rxjs
```

#### 1.3 Replace Type System
- Remove custom `Content`, `Part`, `ChatEvent` types
- Replace with AG-UI `Message`, `Tool`, `RunAgentInput` types
- Update all components to use AG-UI message format

#### 1.4 Implement AgentService
- Create service with environment-based URL configuration
- Implement proper session management with thread/run IDs
- Add connection timeout and retry logic

#### 1.5 Update ChatInterface
- Replace fetch logic with AG-UI agent execution
- Implement single-message streaming constraint
- Add session activation on first message

### Phase 2: Tool System Implementation (3-4 hours)

#### 2.1 Tool Definition System
```typescript
// Standard AG-UI format - no custom fields
const frontendTools = [
  {
    name: "changeBackgroundColor",
    description: "Change the background color of the page",
    parameters: {
      type: "object",
      properties: {
        color: { type: "string", description: "CSS color value" }
      },
      required: ["color"]
    }
  },
  {
    name: "showCalendlyWidget",
    description: "Display a Calendly scheduling widget inline",
    parameters: {
      type: "object", 
      properties: {
        url: { type: "string", description: "Calendly URL" },
        height: { type: "number", description: "Widget height" }
      },
      required: ["url"]
    }
  },
  {
    name: "showNotification",
    description: "Show a browser notification",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Notification title" },
        message: { type: "string", description: "Notification message" }
      },
      required: ["title", "message"]
    }
  }
];
```

#### 2.2 Tool Execution Flow
```typescript
// Frontend tool handlers - like CopilotKit's useCopilotAction
const useToolExecution = () => {
  const [toolCallBuffers, setToolCallBuffers] = useState<Map<string, {
    name: string;
    argsBuffer: string;
    parentMessageId?: string;
  }>>(new Map());

  // Define which tools the frontend can handle
  const frontendToolHandlers = new Map([
    ['changeBackgroundColor', (args: any) => {
      document.body.style.backgroundColor = args.color;
      return `Background color changed to ${args.color}`;
    }],
    ['showCalendlyWidget', (args: any) => {
      setArtifacts(prev => new Map(prev).set(`calendly_${Date.now()}`, {
        type: 'calendly',
        url: args.url,
        height: args.height || 600
      }));
      return `Calendly widget displayed`;
    }],
    ['showNotification', (args: any) => {
      if (Notification.permission === 'granted') {
        new Notification(args.title, { body: args.message });
        return `Notification shown: ${args.title}`;
      } else {
        return `Notification permission required`;
      }
    }],
  ]);

  const subscriber: AgentSubscriber = {
    onToolCallStartEvent: ({ event }) => {
      setToolCallBuffers(prev => new Map(prev).set(event.toolCallId, {
        name: event.toolCallName,
        argsBuffer: "",
        parentMessageId: event.parentMessageId
      }));
    },

    onToolCallArgsEvent: ({ event }) => {
      setToolCallBuffers(prev => {
        const current = prev.get(event.toolCallId);
        if (current) {
          return new Map(prev).set(event.toolCallId, {
            ...current,
            argsBuffer: current.argsBuffer + event.delta
          });
        }
        return prev;
      });
    },

    onToolCallEndEvent: ({ event }) => {
      const toolCall = toolCallBuffers.get(event.toolCallId);
      if (toolCall) {
        // Check if frontend can handle this tool
        if (frontendToolHandlers.has(toolCall.name)) {
          executeFrontendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
        }
        // Backend tools are handled by backend - no frontend action needed
        
        setToolCallBuffers(prev => {
          const newMap = new Map(prev);
          newMap.delete(event.toolCallId);
          return newMap;
        });
      }
    }
  };

  const executeFrontendTool = (toolName: string, argsJson: string, toolCallId: string) => {
    try {
      const args = JSON.parse(argsJson);
      const handler = frontendToolHandlers.get(toolName);
      
      if (handler) {
        const result = handler(args);
        sendToolResult(toolCallId, result);
      }
    } catch (error) {
      sendToolResult(toolCallId, `Error: ${error.message}`);
    }
  };

  const sendToolResult = (toolCallId: string, content: string) => {
    const toolMessage = {
      id: `tool_${Date.now()}`,
      role: "tool" as const,
      content,
      toolCallId
    };
    setMessages(prev => [...prev, toolMessage]);
  };
};
```

#### 2.3 Session Management
```typescript
// Client-side session state management
const useSessionManager = () => {
  const [sessionState, setSessionState] = useState({
    threadId: null,
    runId: null,
    isActive: false
  });

  const startNewRun = async () => {
    const newRunId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const threadId = sessionState.threadId || `thread_${Date.now()}`;
    
    setSessionState({
      threadId,
      runId: newRunId,
      isActive: true
    });

    return { threadId, runId: newRunId };
  };

  const endSession = () => {
    setSessionState({
      threadId: null,
      runId: null,
      isActive: false
    });
    // Clear artifacts when session ends
    setArtifacts(new Map());
  };

  return { sessionState, startNewRun, endSession };
};
```

### Phase 3: Error Handling & Resilience (2-3 hours)

#### 3.1 Error Boundaries
```typescript
// Tool execution error boundary
class ToolExecutionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Tool execution error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <p>Tool execution failed. Please try again.</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

#### 3.2 Timeout Handling
```typescript
// Streaming timeout management
const useStreamingTimeout = (isStreaming: boolean, timeoutMs: number = 30000) => {
  useEffect(() => {
    if (!isStreaming) return;
    
    const timeout = setTimeout(() => {
      console.error('Streaming timeout - resetting connection');
      setIsStreaming(false);
      setMessages(prev => [...prev, {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: 'Connection timed out. Please try again.'
      }]);
    }, timeoutMs);
    
    return () => clearTimeout(timeout);
  }, [isStreaming, timeoutMs]);
};
```

#### 3.3 Partial Tool Argument Handling
```typescript
// Robust JSON parsing for streaming arguments
const safeParseToolArgs = (argsBuffer: string): [any, boolean] => {
  try {
    const parsed = JSON.parse(argsBuffer);
    return [parsed, true];
  } catch (error) {
    // Check if it's incomplete JSON
    const trimmed = argsBuffer.trim();
    if (trimmed.endsWith(',') || trimmed.endsWith('{') || trimmed.endsWith('[')) {
      return [null, false]; // Still streaming
    }
    
    // Try to fix common JSON issues
    try {
      const fixed = trimmed.replace(/,\s*}/, '}').replace(/,\s*]/, ']');
      const parsed = JSON.parse(fixed);
      return [parsed, true];
    } catch (fixError) {
      console.error('Failed to parse tool arguments:', argsBuffer, fixError);
      return [{ error: 'Invalid arguments' }, true];
    }
  }
};
```

### Phase 4: UI Enhancements & Optimizations (2-3 hours)

#### 4.1 High-Frequency Streaming Optimizations
```typescript
// Throttle UI updates for smooth streaming
const useThrottledUpdate = (value: string, delay: number = 16) => {
  const [throttledValue, setThrottledValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setThrottledValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return throttledValue;
};

// Usage in ChatMessages component
const throttledMessage = useThrottledUpdate(currentMessage, 16); // 60fps
```

#### 4.2 Artifact Management
```typescript
// Artifact lifecycle management
const useArtifactManager = () => {
  const [artifacts, setArtifacts] = useState<Map<string, any>>(new Map());
  
  const addArtifact = (id: string, artifact: any) => {
    setArtifacts(prev => new Map(prev).set(id, artifact));
  };
  
  const removeArtifact = (id: string) => {
    setArtifacts(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  };
  
  const clearArtifacts = () => {
    setArtifacts(new Map());
  };
  
  return { artifacts, addArtifact, removeArtifact, clearArtifacts };
};
```

#### 4.3 Inline Artifact Components
```typescript
// Calendly artifact with proper styling
const CalendlyArtifact: React.FC<{url: string, height?: number}> = ({ url, height = 600 }) => {
  return (
    <div className="artifact-container" style={{ 
      margin: '16px 0', 
      borderRadius: '8px', 
      overflow: 'hidden',
      border: '1px solid #e0e0e0'
    }}>
      <div style={{ 
        background: '#f5f5f5', 
        padding: '12px', 
        fontSize: '14px', 
        fontWeight: 'bold',
        borderBottom: '1px solid #e0e0e0'
      }}>
        📅 Calendly Scheduling
      </div>
      <iframe
        src={url}
        width="100%"
        height={height}
        frameBorder="0"
        title="Calendly Scheduling"
        style={{ display: 'block' }}
      />
    </div>
  );
};

// Artifact renderer with error boundaries
const ArtifactRenderer: React.FC<{artifacts: Map<string, any>}> = ({ artifacts }) => {
  return (
    <div className="artifacts-container">
      {Array.from(artifacts.entries()).map(([id, artifact]) => (
        <ToolExecutionErrorBoundary key={id}>
          {artifact.type === 'calendly' && (
            <CalendlyArtifact url={artifact.url} height={artifact.height} />
          )}
        </ToolExecutionErrorBoundary>
      ))}
    </div>
  );
};
```

## Updated File Structure

```
src/
├── components/
│   ├── artifacts/
│   │   ├── CalendlyArtifact.tsx
│   │   ├── ArtifactRenderer.tsx
│   │   └── index.ts
│   ├── ChatInterface.tsx (completely rewritten)
│   ├── ChatMessages.tsx (updated for AG-UI)
│   ├── ChatSuggestions.tsx (minimal changes)
│   └── ToolExecutionErrorBoundary.tsx (new)
├── hooks/
│   ├── useAgentChat.ts (new)
│   ├── useToolExecution.ts (new)
│   ├── useSessionManager.ts (new)
│   ├── useStreamingTimeout.ts (new)
│   └── useArtifactManager.ts (new)
├── services/
│   └── AgentService.ts (new)
├── tools/
│   ├── frontendTools.ts (new)
│   └── toolExecutors.ts (new)
├── types/
│   └── index.ts (replaced with AG-UI types)
└── utils/
    ├── toolArgsParsing.ts (new)
    └── sessionUtils.ts (new)
```

## Environment Configuration

```env
# .env
REACT_APP_AGENT_URL=http://localhost:8000/smarketing
REACT_APP_STREAM_TIMEOUT=30000
REACT_APP_NOTIFICATION_PERMISSION=true
```

## Dependencies

```json
{
  "dependencies": {
    "@ag-ui/client": "latest",
    "rxjs": "^7.8.1",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/uuid": "^9.0.7"
  }
}
```

## Testing Strategy

### Unit Tests
- Tool argument parsing with partial JSON
- Session state management
- Error boundary behavior
- Artifact lifecycle management

### Integration Tests
- Tool execution flow from start to end
- Message streaming with interruptions
- Session restoration across page refreshes
- Error recovery scenarios

### Manual Testing
- High-frequency streaming performance
- Tool execution with various argument types
- Artifact rendering in different screen sizes
- Network disconnection recovery

## Revised Timeline

- **Phase 1**: 3-4 hours (Core AG-UI integration)
- **Phase 2**: 3-4 hours (Proper tool execution system)
- **Phase 3**: 2-3 hours (Error handling & resilience)
- **Phase 4**: 2-3 hours (UI enhancements & optimizations)
- **Testing**: 2-3 hours (Unit, integration, manual)

**Total**: 12-17 hours

## Success Metrics

1. **Streaming Performance**: < 100ms delay for message chunks
2. **Tool Execution**: 100% success rate for valid tool calls
3. **Error Recovery**: Graceful handling of all timeout/failure scenarios
4. **Session Management**: Proper thread/run ID tracking throughout session
5. **Single Stream Constraint**: Only one message streaming at a time
6. **Artifact Performance**: Smooth rendering without layout shifts
7. **Memory Management**: No memory leaks with long-running sessions

## Key Improvements from Original Plan

1. **Correct Tool Flow**: Frontend intercepts tool calls it can handle (like CopilotKit)
2. **No Custom Fields**: Standard AG-UI tool format compliance
3. **Environment Config**: No hardcoded URLs or configuration
4. **Robust Error Handling**: Comprehensive timeout and failure recovery
5. **Session Lifecycle**: Proper client-side session state management
6. **Performance Optimization**: Throttled updates for high-frequency streaming
7. **Complete Rewrite**: No migration complexity or backward compatibility concerns
8. **Simplified Backend**: Backend doesn't need to distinguish tool types

## Backend Requirements

Your backend at `http://localhost:8000/smarketing` should:

1. **Accept all tools** in standard AG-UI format
2. **Let the LLM decide** which tools to call
3. **Send tool call events** for ALL tools the LLM calls
4. **Execute backend tools** directly during processing
5. **Stream results** back using AG-UI events

The frontend will automatically intercept and handle the tools it recognizes, while backend tools will be handled by your server logic.

This revised plan addresses all the critical issues identified in the original critique and provides a production-ready implementation approach.