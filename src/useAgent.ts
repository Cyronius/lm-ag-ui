import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Message } from '@ag-ui/client';
import { AgentClientContextValue, UseAgentOptions } from './index';
import { useAgentSession } from './useAgentSession';
import { useAgentStream } from './useAgentStream';
import { useFrontendToolRunner } from './useFrontendToolRunner';

export function useAgent(options: UseAgentOptions): AgentClientContextValue {
    const { tools = {}, buildForwardedProps } = options;

    const session = useAgentSession(options);
    const stream = useAgentStream(session.client, session.session.isActive, {
        onLifecycleEvent: options.onLifecycleEvent,
        onError: options.onError,
        safetyTimeoutMs: options.safetyTimeoutMs,
        idleTimeoutMs: options.idleTimeoutMs,
        suppressIntermediateAssistantMessages: options.suppressIntermediateAssistantMessages,
        tools,
    });
    useFrontendToolRunner(stream, session, tools, { buildForwardedProps });

    const { state, stateRef, dispatch } = stream;

    // `session.isActive` (and therefore `isStreaming`) genuinely goes false for
    // the whole duration of frontend tool execution: AgentClient.endRun() fires
    // synchronously at RUN_FINISHED, before useFrontendToolRunner's async
    // tool-execution effect has even started awaiting the handler, and only
    // flips back via startNewRun() once the tool result is ready to submit.
    // A consumer watching isStreaming alone (e.g. to gate a send button or a
    // "typing" indicator) sees a false "done" reading for however long the
    // tool call takes — and, worse, can let the user send a second message
    // that races the pending tool chain's own startNewRun()/submitToolResults()
    // against the same AgentClient/thread. Track pending tool work directly
    // from the same RunFinishedPayload useFrontendToolRunner consumes, so
    // `isBusy` below stays true across the whole gap.
    const [hasPendingToolWork, setHasPendingToolWork] = useState(false);
    useEffect(() => {
        return stream.onRunFinished((payload) => {
            setHasPendingToolWork(payload.pendingToolCalls.length > 0);
        });
    }, [stream]);

    const updateState = useCallback((toolName: string, data: unknown) => {
        dispatch({ type: 'UPDATE_TOOL_STATE', toolName, data });
    }, [dispatch]);

    const getState = useCallback((toolName?: string): unknown => {
        return toolName ? stateRef.current.globalState[toolName] : stateRef.current.globalState;
    }, [stateRef]);

    const addMessage = useCallback((message: Message) => {
        dispatch({ type: 'ADD_MESSAGE', message });
    }, [dispatch]);

    const setMessages = useCallback((messages: Message[]) => {
        dispatch({ type: 'SET_MESSAGES', messages });
    }, [dispatch]);

    const clearMessages = useCallback(() => {
        dispatch({ type: 'CLEAR_MESSAGES' });
    }, [dispatch]);

    const terminateRun = useCallback(() => {
        session.client.abortRun();
        dispatch({ type: 'TERMINATE' });
    }, [session, dispatch]);

    const getForwardedProps = useCallback((extraProps?: Record<string, any>): Record<string, any> => {
        const baseProps = buildForwardedProps?.() ?? {};
        return { ...baseProps, ...extraProps };
    }, [buildForwardedProps]);

    const invokeToolByName = useCallback(async (
        toolName: string,
        additionalForwardedProps?: Record<string, any>,
        stateUpdates?: Record<string, any>
    ): Promise<void> => {
        const tool = tools[toolName];
        if (!tool) {
            console.error(`Tool ${toolName} not found`);
            addMessage({
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `Error: Tool '${toolName}' not found`,
            });
            return;
        }

        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: `invoke the ${toolName} tool. Parameters=${JSON.stringify(additionalForwardedProps || {})}`,
        };

        // Defensive: this is a fresh user-initiated run, so clear any chained-run
        // marker left over from a prior turn before starting.
        stream.clearPendingChain();
        session.client.startNewRun();

        try {
            if (stateUpdates) {
                dispatch({ type: 'PATCH_GLOBAL_STATE', patch: stateUpdates });
                session.client.setState({
                    ...stateRef.current.globalState,
                    ...stateUpdates,
                });
            }

            const forwardedProps = getForwardedProps(additionalForwardedProps);

            await session.client.runAgent(
                [...stateRef.current.messages, userMessage],
                [tool.definition],
                stream.subscriber,
                forwardedProps
            );
        } catch (error) {
            console.error('Agent execution failed:', error);
            addMessage({
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `Error executing tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`,
            });
            throw error;
        }
    }, [session, stream.subscriber, tools, addMessage, getForwardedProps, dispatch, stateRef]);

    const clearPendingChain = stream.clearPendingChain;

    return useMemo(() => ({
        agentClient: session.client,
        session: session.session,
        tools,
        globalState: state.globalState,
        messages: state.messages,
        addMessage,
        setMessages,
        clearMessages,
        updateState,
        currentMessage: state.streamingText,
        currentMessageId: state.streamingMessageId,
        isStreaming: session.isStreaming,
        hasPendingToolWork,
        isBusy: session.isStreaming || hasPendingToolWork,
        getToolNameFromCallId: (toolCallId: string) => stateRef.current.toolCallIdToName.get(toolCallId),
        agentSubscriber: stream.subscriber,
        invokeToolByName,
        terminateRun,
        debug: session.client.debug,
        getForwardedProps,
        clearPendingChain,
    }), [
        session.client,
        session.session,
        session.isStreaming,
        hasPendingToolWork,
        tools,
        state.globalState,
        state.messages,
        state.streamingText,
        state.streamingMessageId,
        stream.subscriber,
        stateRef,
        addMessage,
        setMessages,
        clearMessages,
        updateState,
        invokeToolByName,
        terminateRun,
        getForwardedProps,
        clearPendingChain,
    ]);
}
