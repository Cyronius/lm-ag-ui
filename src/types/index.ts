// Import AG-UI types for local use
import type {
  Message,
  Tool,
  RunAgentInput,
  BaseEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent
} from '@ag-ui/core';

// AG-UI Types - Re-export from @ag-ui/core (which is re-exported by @ag-ui/client)
export type {
  Message,
  Tool,
  RunAgentInput,
  BaseEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent
} from '@ag-ui/core';
export { EventType } from '@ag-ui/core';
export { HttpAgent } from '@ag-ui/client';

// Custom types for our application
export interface ChatInterfaceProps {
  onBack?: () => void;
}

export interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

export interface SessionState {
  threadId: string | null;
  runId: string | null;
  isActive: boolean;
}

export interface ToolCallBuffer {
  name: string;
  argsBuffer: string;
  parentMessageId?: string;
}

export interface ArtifactData {
  type: string;
  [key: string]: any;
}

export type FrontendToolHandler = (args: any) => string;

export interface StandardTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

export interface RunAgentResult {
  result: any;
  newMessages: Message[];
}

export interface AgentSubscriber {
  onRunStartedEvent?(params: { event: RunStartedEvent }): void;
  onTextMessageContentEvent?(params: { event: TextMessageContentEvent }): void;
  onRunFinishedEvent?(params: { event: RunFinishedEvent }): void;
  onRunErrorEvent?(params: { event: RunErrorEvent }): void;
  onToolCallStartEvent?(params: { event: ToolCallStartEvent }): void;
  onToolCallArgsEvent?(params: { event: ToolCallArgsEvent }): void;
  onToolCallEndEvent?(params: { event: ToolCallEndEvent }): void;
}