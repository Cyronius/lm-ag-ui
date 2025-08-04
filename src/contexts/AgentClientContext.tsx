import React, { createContext, useState, useEffect } from 'react';
import { AgentClient } from '../services/AgentClient';

// Import Session type from AgentClient since it's now defined there
type Session = {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
};

interface AgentClientContextValue {
    agentClient: AgentClient;
    session: Session;
}

const AgentClientContext = createContext<AgentClientContextValue | null>(null);

interface AgentClientProviderProps {
    children: React.ReactNode;
}

export function AgentClientProvider({ children }: AgentClientProviderProps) {
    // Create a single AgentClient instance
    const [agentClient] = useState(() => new AgentClient());
    
    // Track session for React re-renders
    const [session, setSession] = useState<Session>(agentClient.session);

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

// Custom hook to access the agentClient from context
import { useContext } from 'react';

export function useAgentClient() {
    const context = useContext(AgentClientContext);
    if (!context) {
        throw new Error('useAgentClient must be used within an AgentClientProvider');
    }
    return context.agentClient;
}

export function useAgentSession() {
    const context = useContext(AgentClientContext);
    if (!context) {
        throw new Error('useAgentSession must be used within an AgentClientProvider');
    }
    return context.session;
}