import { createContext, useContext } from 'react';
import { AgentClientContextValue, AgentProviderProps } from './index';

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
