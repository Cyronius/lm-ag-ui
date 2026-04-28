import { useState, useRef, useCallback, useEffect, Dispatch } from 'react';
import {
    AgentSubscriber,
    Message,
    TextMessageStartEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    StateSnapshotEvent,
} from '@ag-ui/client';
import { v4 as uuidv4 } from 'uuid';
import { agentReducer, initialAgentState, AgentState, AgentAction } from './agentReducer';
import { AgentClient } from './AgentClient';
import { ToolDefinition, UseAgentOptions } from './index';
import { getFrontEndTools } from './toolUtils';

export interface PendingToolCall {
    toolCallId: string;
    name: string;
    argsBuffer: string;
}

export interface RunFinishedPayload {
    finalMessages: Message[];
    pendingToolCalls: PendingToolCall[];
    stateSnapshot: AgentState;
}

export interface StreamHandle {
    state: AgentState;
    stateRef: React.MutableRefObject<AgentState>;
    dispatch: Dispatch<AgentAction>;
    subscriber: AgentSubscriber;
    onRunFinished: (cb: (p: RunFinishedPayload) => void) => () => void;
    /**
     * Set to `true` by `useFrontendToolRunner` immediately before
     * `submitToolResults`. Read (and cleared) on the next `RunStarted` to
     * distinguish a chained run (continuation of the user's turn) from a
     * fresh user-initiated run. Drives first/final-message preservation when
     * `suppressIntermediateAssistantMessages` is on.
     */
    chainedRunRef: React.MutableRefObject<boolean>;
}

type StreamOptions = Pick<UseAgentOptions, 'onLifecycleEvent' | 'onError' | 'safetyTimeoutMs' | 'suppressIntermediateAssistantMessages'> & {
    tools?: Record<string, ToolDefinition>;
};

/**
 * Subscribes to AG-UI events, runs the reducer, and exposes a RunFinished
 * event to consumers. No AgentClient mutation beyond receiving it for the
 * safety-timeout abort, and no tool execution logic.
 */
export function useAgentStream(
    client: AgentClient,
    sessionIsActive: boolean,
    options: StreamOptions
): StreamHandle {
    const { onLifecycleEvent, onError, safetyTimeoutMs, suppressIntermediateAssistantMessages, tools = {} } = options;
    const effectiveSafetyTimeoutMs = safetyTimeoutMs ?? 300_000;

    const [state, setState] = useState<AgentState>(initialAgentState);
    const stateRef = useRef<AgentState>(state);
    const dispatch = useCallback((action: AgentAction) => {
        const next = agentReducer(stateRef.current, action);
        if (next === stateRef.current) return;
        stateRef.current = next;
        setState(next);
    }, []);

    // First/final-message preservation under `suppressIntermediateAssistantMessages`.
    // Sticky from setup options.
    const suppressEnabledRef = useRef(!!suppressIntermediateAssistantMessages);
    suppressEnabledRef.current = !!suppressIntermediateAssistantMessages;

    // Reset to `false` at the start of every new user-initiated turn. Stays
    // `true` across chained runs within the same turn.
    const firstTextEmittedThisTurnRef = useRef(false);

    // Set by `useFrontendToolRunner` immediately before `submitToolResults`;
    // read & cleared by `onRunStartedEvent` to detect chained vs. fresh runs.
    const chainedRunRef = useRef(false);

    // Text segments buffered during a chained run after the turn's first
    // text has already been emitted. At RUN_FINISHED, we either flush them
    // (no tool calls in this run → final result) or drop them (tool calls
    // present → intermediate narration).
    interface BufferedSegment { messageId: string; text: string }
    const bufferedFinalTextRef = useRef<BufferedSegment[]>([]);
    const bufferedMessageIdsRef = useRef<Set<string>>(new Set());

    const runFinishedListenersRef = useRef<Set<(p: RunFinishedPayload) => void>>(new Set());
    const onRunFinished = useCallback((cb: (p: RunFinishedPayload) => void) => {
        runFinishedListenersRef.current.add(cb);
        return () => { runFinishedListenersRef.current.delete(cb); };
    }, []);

    // Safety timeout: force-end runs stuck for over the configured timeout
    useEffect(() => {
        if (!sessionIsActive) return;
        const timeoutId = setTimeout(() => {
            console.warn(`[AG-UI] Safety timeout: forcing run end after ${effectiveSafetyTimeoutMs}ms`);
            dispatch({ type: 'CLEAR_STREAMING' });
            dispatch({ type: 'CLEAR_TOOL_BUFFERS' });
            dispatch({ type: 'SET_ABORTED', value: true });
            client.abortRun();
            onError?.({ code: 'timeout', message: `Run exceeded safety timeout of ${effectiveSafetyTimeoutMs}ms` });
            dispatch({
                type: 'ADD_MESSAGE',
                message: {
                    id: `timeout_${Date.now()}`,
                    role: 'assistant',
                    content: 'The request timed out. Please try again.',
                },
            });
        }, effectiveSafetyTimeoutMs);
        return () => clearTimeout(timeoutId);
    }, [sessionIsActive, effectiveSafetyTimeoutMs, client, dispatch, onError]);

    // Resolve latest tools on every render via ref so subscriber handlers see fresh map.
    const toolsRef = useRef(tools);
    toolsRef.current = tools;

    const addErrorMessage = useCallback((error: unknown) => {
        dispatch({
            type: 'ADD_MESSAGE',
            message: { id: uuidv4(), role: 'assistant', content: `${error}` },
        });
    }, [dispatch]);

    // Stable subscriber identity. Handlers close over refs (stateRef, toolsRef)
    // so fresh reads work without re-creating the subscriber.
    const subscriberRef = useRef<AgentSubscriber>({
        onEvent: () => {},
        onRunStartedEvent: () => {},
        onTextMessageStartEvent: () => {},
        onTextMessageContentEvent: () => {},
        onTextMessageEndEvent: () => {},
        onStateSnapshotEvent: () => {},
        onRunFinishedEvent: () => {},
        onRunErrorEvent: () => {},
        onToolCallStartEvent: () => {},
        onToolCallArgsEvent: () => {},
        onToolCallEndEvent: () => {},
        onToolCallResultEvent: () => {},
    });

    subscriberRef.current.onEvent = () => {};

    subscriberRef.current.onRunStartedEvent = ({ event }: { event: RunStartedEvent }) => {
        console.info('[AG-UI] RunStarted:', {
            threadId: event.threadId,
            runId: event.runId,
            message: stateRef.current.messages.slice(-1)[0]?.content,
        });
        if (suppressEnabledRef.current) {
            if (chainedRunRef.current) {
                // Continuing the same agentic turn — preserve firstText state.
                chainedRunRef.current = false;
            } else {
                // Fresh user-initiated turn — reset turn-scoped state.
                firstTextEmittedThisTurnRef.current = false;
                bufferedFinalTextRef.current = [];
                bufferedMessageIdsRef.current.clear();
            }
        }
        onLifecycleEvent?.({ type: 'run_started' });
        dispatch({ type: 'SNAPSHOT_PRE_RUN' });
    };

    // Flush the in-flight turn (text + unflushed tool calls) into messages and
    // fire the lifecycle announcement. Used at turn boundaries (next
    // TextMessageStart with content already buffered) and at RunFinished.
    const flushTurn = () => {
        const before = stateRef.current;
        const hasUnflushedToolCall = Array.from(before.toolCallBuffers.keys()).some(
            id => !before.flushedToolCallIds.has(id)
        );
        if (!before.streamingText.trim() && !hasUnflushedToolCall) return;
        dispatch({ type: 'FINALIZE_TURN' });
        const announced = stateRef.current.lastAnnouncedAssistantText;
        if (announced) {
            console.info('[AG-UI] TextMessage: ', announced);
            onLifecycleEvent?.({ type: 'message_added', role: 'assistant', content: announced });
        }
    };

    subscriberRef.current.onTextMessageStartEvent = ({ event }: { event: TextMessageStartEvent }) => {
        if (suppressEnabledRef.current && firstTextEmittedThisTurnRef.current) {
            // Already shown the first text of this turn. Buffer this segment;
            // RUN_FINISHED will decide whether to flush (final) or drop (middle).
            bufferedMessageIdsRef.current.add(event.messageId);
            bufferedFinalTextRef.current.push({ messageId: event.messageId, text: '' });
            return;
        }
        console.info('[AG-UI] TextMessageStart:', { messageId: event.messageId, role: event.role });
        if (suppressEnabledRef.current) {
            // First text of the turn — stream it live.
            firstTextEmittedThisTurnRef.current = true;
        }
        // If a previous turn's text/tool-calls are still pending, commit them
        // before this new text segment begins.
        flushTurn();
    };

    subscriberRef.current.onTextMessageContentEvent = ({ event }: { event: TextMessageContentEvent }) => {
        if (bufferedMessageIdsRef.current.has(event.messageId)) {
            const seg = bufferedFinalTextRef.current.find(s => s.messageId === event.messageId);
            if (seg) seg.text += event.delta;
            return;
        }
        dispatch({ type: 'TEXT_DELTA', messageId: event.messageId, delta: event.delta });
    };

    subscriberRef.current.onTextMessageEndEvent = ({ event }: { event: TextMessageEndEvent }) => {
        if (bufferedMessageIdsRef.current.has(event.messageId)) {
            // Keep buffered; final disposition decided at RUN_FINISHED.
            return;
        }
        console.info('[AG-UI] TextMessageEnd:', { messageId: event.messageId });
    };

    subscriberRef.current.onStateSnapshotEvent = ({ event }: { event: StateSnapshotEvent }) => {
        console.info('[AG-UI] StateSnapshot:', { snapshot: event.snapshot });
        dispatch({ type: 'MERGE_STATE_SNAPSHOT', snapshot: event.snapshot as Record<string, unknown> });
    };

    subscriberRef.current.onRunFinishedEvent = ({ event }: { event: RunFinishedEvent }) => {
        console.info('[AG-UI] RunFinished:', { event });
        // Resolve buffered text BEFORE flushTurn so the decision uses the
        // run's tool-call presence (cleared by FINALIZE_TURN inside flushTurn).
        if (bufferedFinalTextRef.current.length > 0) {
            const before = stateRef.current;
            const hasUnflushedToolCall = Array.from(before.toolCallBuffers.keys()).some(
                id => !before.flushedToolCallIds.has(id)
            );
            if (hasUnflushedToolCall) {
                console.info('[AG-UI] Dropped intermediate narration:',
                    bufferedFinalTextRef.current.map(s => s.text));
            } else {
                for (const seg of bufferedFinalTextRef.current) {
                    if (!seg.text.trim()) continue;
                    dispatch({
                        type: 'ADD_MESSAGE',
                        message: { id: seg.messageId, role: 'assistant', content: seg.text },
                    });
                    onLifecycleEvent?.({ type: 'message_added', role: 'assistant', content: seg.text });
                }
            }
            bufferedFinalTextRef.current = [];
            bufferedMessageIdsRef.current.clear();
        }
        try {
            flushTurn();
        } catch (error) {
            console.error('Error creating assistant message:', error);
            const errorDetail = error instanceof Error ? error.message : String(error);
            addErrorMessage(`Error processing assistant response: ${errorDetail}`);
        } finally {
            dispatch({ type: 'CLEAR_STREAMING' });
            client.endRun();
        }

        // Snapshot must be taken AFTER SET_MESSAGES / CLEAR_STREAMING have been dispatched,
        // so listeners see finalMessages with the assembled assistant message.
        const snap = stateRef.current;
        const pendingToolCalls: PendingToolCall[] = [];
        for (const [toolCallId, tc] of snap.toolCallBuffers.entries()) {
            if (!tc.resultReceived) {
                pendingToolCalls.push({ toolCallId, name: tc.name, argsBuffer: tc.argsBuffer });
            }
        }
        const payload: RunFinishedPayload = {
            finalMessages: snap.messages,
            pendingToolCalls,
            stateSnapshot: snap,
        };
        for (const cb of runFinishedListenersRef.current) {
            try { cb(payload); } catch (e) { console.error('RunFinished listener error:', e); }
        }
    };

    subscriberRef.current.onRunErrorEvent = ({ event }: { event: RunErrorEvent }) => {
        console.info('[AG-UI] RunError:', { message: event.message });
        if (stateRef.current.isAborted) {
            dispatch({ type: 'SET_ABORTED', value: false });
            console.info('[AG-UI] Run aborted by user');
            onError?.({ code: 'aborted', message: event.message, raw: event });
            return;
        }
        dispatch({ type: 'CLEAR_STREAMING' });
        firstTextEmittedThisTurnRef.current = false;
        chainedRunRef.current = false;
        bufferedFinalTextRef.current = [];
        bufferedMessageIdsRef.current.clear();
        dispatch({
            type: 'ADD_MESSAGE',
            message: { id: `error_${Date.now()}`, role: 'assistant', content: `Error: ${event.message}` },
        });
        onError?.({ code: 'run_error', message: event.message, raw: event });
        client.endRun();
    };

    subscriberRef.current.onToolCallStartEvent = ({ event }: { event: ToolCallStartEvent }) => {
        console.info('[AG-UI] ToolCallStart:', {
            toolCallId: event.toolCallId,
            toolCallName: event.toolCallName,
            parentMessageId: event.parentMessageId,
        });
        onLifecycleEvent?.({ type: 'tool_used', toolName: event.toolCallName });
        dispatch({
            type: 'TOOL_CALL_START',
            toolCallId: event.toolCallId,
            name: event.toolCallName,
            parentMessageId: event.parentMessageId,
        });
    };

    subscriberRef.current.onToolCallArgsEvent = ({ event }: { event: ToolCallArgsEvent }) => {
        console.info('[AG-UI] ToolCallArgs:', { toolCallId: event.toolCallId, delta: event.delta });
        dispatch({ type: 'TOOL_CALL_ARGS', toolCallId: event.toolCallId, delta: event.delta });
    };

    subscriberRef.current.onToolCallEndEvent = ({ event }: { event: ToolCallEndEvent }) => {
        console.info('[AG-UI] ToolCallEnd:', { toolCallId: event.toolCallId });
    };

    subscriberRef.current.onToolCallResultEvent = ({ event }: { event: ToolCallResultEvent }) => {
        console.info('[AG-UI] ToolCallResult:', { toolCallId: event.toolCallId, content: event.content });
        try {
            const toolResultMessage: Message = {
                id: `tool_result_${event.toolCallId}_${Date.now()}`,
                role: 'tool',
                content: event.content || '',
                toolCallId: event.toolCallId,
            };
            dispatch({ type: 'TOOL_CALL_RESULT', toolCallId: event.toolCallId, message: toolResultMessage });

            const toolCall = stateRef.current.toolCallBuffers.get(event.toolCallId);
            if (toolCall) {
                const tool = toolsRef.current[toolCall.name];
                if (tool?.onResult) {
                    try {
                        const args = JSON.parse(toolCall.argsBuffer || '{}');
                        const updateState = (toolName: string, data: unknown) =>
                            dispatch({ type: 'UPDATE_TOOL_STATE', toolName, data });
                        const getState = (toolName?: string) =>
                            toolName ? stateRef.current.globalState[toolName] : stateRef.current.globalState;
                        tool.onResult(args, event.content || '', updateState, getState);
                    } catch (error) {
                        console.error(`Error calling onResult for tool ${toolCall.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error creating tool result message:', error);
            const errorDetail = error instanceof Error ? error.message : String(error);
            addErrorMessage(`Error processing tool result: ${errorDetail}`);
        }
    };

    return {
        state,
        stateRef,
        dispatch,
        subscriber: subscriberRef.current,
        onRunFinished,
        chainedRunRef,
    };
}

// Re-export for consumers building their own runners
export { getFrontEndTools };
