import type { Message } from '@ag-ui/client';

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
            };

        case 'CLEAR_STREAMING':
            return { ...state, streamingText: '', streamingMessageId: null };

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
            const toolCallBuffers = new Map(state.toolCallBuffers);
            if (current) {
                toolCallBuffers.set(action.toolCallId, { ...current, resultReceived: true });
            }
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
