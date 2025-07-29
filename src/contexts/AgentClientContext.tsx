import React, { createContext, useState, useEffect } from 'react';
import { AgentClient } from '../services/AgentClient';
import { SessionState } from '../types/index';

interface AgentClientContextValue {
    agentClient: AgentClient;
    session: SessionState;
}

const AgentClientContext = createContext<AgentClientContextValue | null>(null);

interface AgentClientProviderProps {
    children: React.ReactNode;
}

export function AgentClientProvider({ children }: AgentClientProviderProps) {
    // Create a single AgentClient instance
    const [agentClient] = useState(() => new AgentClient());
    
    // Track session state for React re-renders
    const [session, setSession] = useState<SessionState>(agentClient.session);

    // Set up the callback when component mounts
    useEffect(() => {
        agentClient.setSessionChangeCallback(setSession);
    }, [agentClient]);

    const contextValue: AgentClientContextValue = {
        agentClient,
        session
    };

    return (
        <AgentClientContext.Provider value={contextValue}>
            {children}
        </AgentClientContext.Provider>
    );
}

export { AgentClientContext };