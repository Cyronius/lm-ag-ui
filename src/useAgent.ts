import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AgentClientContextValue, UseAgentOptions } from './types';
import { AgentClient } from './AgentClient';
import { AgentStore, AgentStoreOptions } from './AgentStore';

const EMPTY_TOOLS: AgentClientContextValue['tools'] = {};

function pickStoreOptions(options: UseAgentOptions): AgentStoreOptions {
    return {
        tools: options.tools,
        buildForwardedProps: options.buildForwardedProps,
        onLifecycleEvent: options.onLifecycleEvent,
        onError: options.onError,
        safetyTimeoutMs: options.safetyTimeoutMs,
        idleTimeoutMs: options.idleTimeoutMs,
        suppressIntermediateAssistantMessages: options.suppressIntermediateAssistantMessages,
    };
}

/**
 * Thin React binding over AgentStore. The store (and its AgentClient) is
 * created once per mount; every mutable option flows through
 * `store.setOptions` on each render, so option identity churn is harmless.
 * `baseUrl`/`agentId` changes require a remount (useAgentSetup keys on them).
 */
export function useAgent(options: UseAgentOptions): AgentClientContextValue {
    const [store] = useState(() => new AgentStore(
        new AgentClient(options.baseUrl ?? 'http://localhost:8000', options.agentId, {
            tokenProvider: options.tokenProvider,
            requestHandler: options.requestHandler,
            timeout: options.timeout,
            sendFullHistory: options.sendFullHistory,
            initialThreadId: options.initialThreadId,
            systemContextBuilder: options.systemContextBuilder,
            debug: options.debug,
            pruneOutboundMessages: options.pruneOutboundMessages,
            configParams: options.configParams,
        }),
        pickStoreOptions(options)
    ));

    // Latest-wins options sync — the React-legal replacement for the old
    // render-phase `toolsRef.current = tools` pattern. Runs after every render.
    // tokenProvider is consulted per wire call, so it stays updatable too;
    // the other transport options are frozen at client construction.
    useEffect(() => {
        store.setOptions(pickStoreOptions(options));
        store.client.setTokenProvider?.(options.tokenProvider);
    });

    // Quiesce on unmount. Non-terminal: under StrictMode's dev double-mount the
    // same store instance is disposed and then reused — see AgentStore.dispose.
    useEffect(() => () => store.dispose(), [store]);

    const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

    const tools = options.tools ?? EMPTY_TOOLS;

    return useMemo<AgentClientContextValue>(() => ({
        agentClient: store.client,
        session: snap.session,
        tools,
        globalState: snap.state.globalState,
        messages: snap.state.messages,
        addMessage: store.addMessage,
        setMessages: store.setMessages,
        clearMessages: store.clearMessages,
        updateState: store.updateToolState,
        currentMessage: snap.state.streamingText,
        currentMessageId: snap.state.streamingMessageId,
        isStreaming: snap.isStreaming,
        hasPendingToolWork: snap.hasPendingToolWork,
        isBusy: snap.isBusy,
        getToolNameFromCallId: store.getToolNameFromCallId,
        agentSubscriber: store,
        invokeToolByName: store.invokeToolByName,
        terminateRun: store.terminateRun,
        debug: store.client.debug,
        getForwardedProps: store.getForwardedProps,
        clearPendingChain: store.clearPendingChain,
    }), [store, snap, tools]);
}
