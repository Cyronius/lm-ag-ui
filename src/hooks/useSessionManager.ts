import { useState, useCallback } from 'react';
import { SessionState } from '../types/index';
import { v4 as uuidv4 } from 'uuid';

export const useSessionManager = () => {
    const [sessionState, setSessionState] = useState<SessionState>({
        threadId: null,
        runId: null,
        isActive: false
    });

    const startNewRun = useCallback(() => {
        const newRunId = `run_${Date.now()}_${uuidv4().slice(0, 8)}`;
        const threadId = sessionState.threadId || `thread_${Date.now()}_${uuidv4().slice(0, 8)}`;

        const newState = {
            threadId,
            runId: newRunId,
            isActive: true
        };

        setSessionState(newState);
        return newState;
    }, [sessionState.threadId]);

    const endRun = useCallback(() => {
        setSessionState((prev: SessionState) => ({
            ...prev,
            runId: null,
            isActive: false
        }));
    }, []);

    const endSession = useCallback(() => {
        setSessionState({
            threadId: null,
            runId: null,
            isActive: false
        });
    }, []);

    const updateSessionState = useCallback((updates: Partial<SessionState>) => {
        setSessionState((prev: SessionState) => ({ ...prev, ...updates }));
    }, []);

    console.log('session state', sessionState)

    return {
        sessionState,
        startNewRun,
        endRun,
        endSession,
        updateSessionState
    };
};