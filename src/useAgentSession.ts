import { useState, useEffect, useCallback } from 'react';
import { AgentClient } from './AgentClient';
import { Session, UseAgentOptions } from './index';

export interface SessionHandle {
    client: AgentClient;
    session: Session;
    isStreaming: boolean;
    startNewRun: () => void;
    endRun: () => void;
    abortRun: () => void;
}

/**
 * Owns the AgentClient lifecycle and session state. Knows nothing about
 * messages, streaming, or tools — purely the transport + session layer.
 */
export function useAgentSession(options: UseAgentOptions): SessionHandle {
    const {
        baseUrl,
        agentId,
        tokenProvider,
        requestHandler,
        timeout,
        sendFullHistory,
        initialThreadId,
        systemContextBuilder,
        debug,
    } = options;

    const [client] = useState(
        () => new AgentClient(baseUrl, agentId, {
            tokenProvider,
            requestHandler,
            timeout,
            sendFullHistory,
            initialThreadId,
            systemContextBuilder,
            debug,
        })
    );

    const [session, setSession] = useState<Session>(client.session);
    const [isStreaming, setIsStreaming] = useState<boolean>(false);

    useEffect(() => {
        client.setSessionChangeCallback(setSession);
        setIsStreaming(client.session.isActive);
    }, [client]);

    useEffect(() => {
        setIsStreaming(session.isActive);
    }, [session.isActive]);

    const startNewRun = useCallback(() => { client.startNewRun(); }, [client]);
    const endRun = useCallback(() => { client.endRun(); }, [client]);
    const abortRun = useCallback(() => { client.abortRun(); }, [client]);

    return { client, session, isStreaming, startNewRun, endRun, abortRun };
}
