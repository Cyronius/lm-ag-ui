import React, { createContext, useContext } from 'react';
import { AgentClientContextValue } from './index';

interface AgentProviderProps {
    value: AgentClientContextValue;
    children: React.ReactNode;
}

const AgentClientContext = createContext<AgentClientContextValue | null>(null);

export function AgentProvider({ value, children }: AgentProviderProps) {
    return (
        <AgentClientContext.Provider value={value}>
            {children}
        </AgentClientContext.Provider>
    );
}

export function useAgentContext() {
    const context = useContext(AgentClientContext);
    if (!context) {
        throw new Error('useAgentContext must be used within an AgentProvider');
    }
    return context;
}
