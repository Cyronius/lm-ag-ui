import type { Message, ToolCall } from '@ag-ui/client';
import { assembleFinalMessages } from './assembleFinalMessages';

export interface ToolCallBuffer {
    name: string;
    argsBuffer: string;
    parentMessageId?: string;
    resultReceived?: boolean;
}

export interface AgentState {
    messages: Message[];
    streamingText: string;
    streamingMessageId: string | null;
    toolCallBuffers: Map<string, ToolCallBuffer>;
    toolCallIdToName: Map<string, string>;
    // IDs of tool calls already committed to a finalized assistant message via FINALIZE_TURN.
    // Subsequent FINALIZE_TURN calls skip these so the same tool call is not assembled twice
    // across successive turns within one run.
    flushedToolCallIds: Set<string>;
    // Set by FINALIZE_TURN; the hook reads it to fire onLifecycleEvent('message_added').
    // Cleared on the next FINALIZE_TURN, SNAPSHOT_PRE_RUN, TERMINATE.
    lastAnnouncedAssistantText: string | null;
    isAborted: boolean;
    globalState: Record<string, unknown>;
    preRunMessageCount: number;
}

export const initialAgentState: AgentState = {
    messages: [],
    streamingText: '',
    streamingMessageId: null,
    toolCallBuffers: new Map(),
    toolCallIdToName: new Map(),
    flushedToolCallIds: new Set(),
    lastAnnouncedAssistantText: null,
    isAborted: false,
    globalState: {},
    preRunMessageCount: 0,
};

export type AgentAction =
    | { type: 'ADD_MESSAGE'; message: Message }
    | { type: 'SET_MESSAGES'; messages: Message[] }
    | { type: 'CLEAR_MESSAGES' }
    | { type: 'SNAPSHOT_PRE_RUN' }
    | { type: 'CLEAR_STREAMING' }
    | { type: 'FINALIZE_TURN' }
    | { type: 'TEXT_DELTA'; messageId: string; delta: string }
    | { type: 'TOOL_CALL_START'; toolCallId: string; name: string; parentMessageId?: string }
    | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
    | { type: 'TOOL_CALL_RESULT'; toolCallId: string; message: Message }
    | { type: 'CLEAR_TOOL_BUFFERS' }
    | { type: 'SET_ABORTED'; value: boolean }
    | { type: 'TERMINATE' }
    | { type: 'UPDATE_TOOL_STATE'; toolName: string; data: unknown }
    | { type: 'PATCH_GLOBAL_STATE'; patch: Record<string, unknown> }
    | { type: 'MERGE_STATE_SNAPSHOT'; snapshot: Record<string, unknown> };

export function agentReducer(state: AgentState, action: AgentAction): AgentState {
    switch (action.type) {
        case 'ADD_MESSAGE':
            return { ...state, messages: [...state.messages, action.message] };

        case 'SET_MESSAGES':
            return { ...state, messages: action.messages };

        case 'CLEAR_MESSAGES':
            return { ...state, messages: [] };

        case 'SNAPSHOT_PRE_RUN':
            // Excludes the user message added immediately before startNewRun.
            return {
                ...state,
                preRunMessageCount: Math.max(0, state.messages.length - 1),
                streamingText: '',
                streamingMessageId: null,
                flushedToolCallIds: new Set(),
                lastAnnouncedAssistantText: null,
            };

        case 'CLEAR_STREAMING':
            return { ...state, streamingText: '', streamingMessageId: null };

        case 'FINALIZE_TURN': {
            const finalText = state.streamingText.trim();
            const turnToolCalls: ToolCall[] = [];
            for (const [toolCallId, tc] of state.toolCallBuffers.entries()) {
                if (state.flushedToolCallIds.has(toolCallId)) continue;
                turnToolCalls.push({
                    id: toolCallId,
                    type: 'function',
                    function: { name: tc.name, arguments: tc.argsBuffer || '{}' },
                });
            }

            if (!finalText && turnToolCalls.length === 0) {
                return {
                    ...state,
                    streamingText: '',
                    streamingMessageId: null,
                    lastAnnouncedAssistantText: null,
                };
            }

            const result = assembleFinalMessages({
                finalText,
                toolCalls: turnToolCalls,
                existingMessages: state.messages,
                streamingMessageId: state.streamingMessageId,
            });

            const flushedToolCallIds = new Set(state.flushedToolCallIds);
            for (const tc of turnToolCalls) flushedToolCallIds.add(tc.id);

            return {
                ...state,
                messages: result.messages,
                streamingText: '',
                streamingMessageId: null,
                flushedToolCallIds,
                lastAnnouncedAssistantText: result.announcedAssistantText,
            };
        }

        case 'TEXT_DELTA':
            return {
                ...state,
                streamingText: state.streamingText + action.delta,
                streamingMessageId: action.messageId,
            };

        case 'TOOL_CALL_START': {
            const toolCallBuffers = new Map(state.toolCallBuffers);
            toolCallBuffers.set(action.toolCallId, {
                name: action.name,
                argsBuffer: '',
                parentMessageId: action.parentMessageId,
            });
            const toolCallIdToName = new Map(state.toolCallIdToName);
            toolCallIdToName.set(action.toolCallId, action.name);
            return { ...state, toolCallBuffers, toolCallIdToName };
        }

        case 'TOOL_CALL_ARGS': {
            const current = state.toolCallBuffers.get(action.toolCallId);
            if (!current) return state;
            const toolCallBuffers = new Map(state.toolCallBuffers);
            toolCallBuffers.set(action.toolCallId, {
                ...current,
                argsBuffer: current.argsBuffer + action.delta,
            });
            return { ...state, toolCallBuffers };
        }

        case 'TOOL_CALL_RESULT': {
            const current = state.toolCallBuffers.get(action.toolCallId);
            if (!current) {
                // No live buffer for this id — a duplicate delivery or a stale
                // event from a prior errored/aborted run. Appending it anyway
                // would leave an orphaned `tool` message with no owning
                // assistant.tool_calls entry, which OpenAI-compatible providers
                // reject at the next full-history send.
                console.warn(
                    `[AG-UI] Dropping TOOL_CALL_RESULT for unknown toolCallId=${action.toolCallId} (no live buffer)`
                );
                return state;
            }
            const toolCallBuffers = new Map(state.toolCallBuffers);
            toolCallBuffers.set(action.toolCallId, { ...current, resultReceived: true });
            return {
                ...state,
                messages: [...state.messages, action.message],
                toolCallBuffers,
            };
        }

        case 'CLEAR_TOOL_BUFFERS':
            return { ...state, toolCallBuffers: new Map() };

        case 'SET_ABORTED':
            return { ...state, isAborted: action.value };

        case 'TERMINATE':
            return {
                ...state,
                isAborted: true,
                streamingText: '',
                streamingMessageId: null,
                toolCallBuffers: new Map(),
                toolCallIdToName: new Map(),
                flushedToolCallIds: new Set(),
                lastAnnouncedAssistantText: null,
                messages: state.messages.slice(0, state.preRunMessageCount),
            };

        case 'UPDATE_TOOL_STATE':
            return {
                ...state,
                globalState: { ...state.globalState, [action.toolName]: action.data },
            };

        case 'PATCH_GLOBAL_STATE':
            return { ...state, globalState: { ...state.globalState, ...action.patch } };

        case 'MERGE_STATE_SNAPSHOT': {
            // Merge the snapshot with existing state, but preserve frontend-managed keys
            // (those starting with `_`, e.g. `_soco_accumulated_outlines`) that the backend
            // doesn't know about and would otherwise overwrite.
            const merged: Record<string, unknown> = { ...state.globalState, ...action.snapshot };
            for (const key of Object.keys(state.globalState)) {
                if (key.startsWith('_')) merged[key] = state.globalState[key];
            }
            return { ...state, globalState: merged };
        }

        default:
            return state;
    }
}
