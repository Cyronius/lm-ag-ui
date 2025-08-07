import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { AgentClient } from '../services/AgentClient';
import { UnifiedToolDefinition, createUnifiedTools } from '../tools/unifiedTools';

// Import Session type from AgentClient since it's now defined there
type Session = {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
};

interface AgentClientContextValue {
    agentClient: AgentClient;
    session: Session;
    tools: Record<string, UnifiedToolDefinition>;
    globalState: any;
    updateState: (toolName: string, data: any) => void;
    getState: (toolName?: string) => any;
}

const AgentClientContext = createContext<AgentClientContextValue | null>(null);

interface AgentClientProviderProps {
    children: React.ReactNode;
    tools: Record<string, UnifiedToolDefinition>;
}

export function AgentClientProvider({ children, tools }: AgentClientProviderProps) {
    // Create a single AgentClient instance
    const [agentClient] = useState(() => new AgentClient());
    
    // Track session for React re-renders
    const [session, setSession] = useState<Session>(agentClient.session);
    
    // Global AG-UI state management
    const [globalState, setGlobalState] = useState<any>({});

    // Set up the callback when component mounts
    useEffect(() => {
        agentClient.setSessionChangeCallback(setSession);
    }, [agentClient]);

    // State management functions
    const updateState = (toolName: string, data: any) => {
        setGlobalState((prev: any) => ({
            ...prev,
            [toolName]: data
        }));
    };
    
    const getState = (toolName?: string) => {
        if (toolName) {
            return globalState[toolName];
        }
        return globalState;
    };
    
    // Tools are passed in - we just use them directly
    // The tools should have been created with proper state management functions

    const contextValue: AgentClientContextValue = {
        agentClient,
        session,
        tools,
        globalState,
        updateState,
        getState
    };

    return (
        <AgentClientContext.Provider value={contextValue}>
            {children}
        </AgentClientContext.Provider>
    );
}



export function useAgentContext() {
    const context = useContext(AgentClientContext);
    if (!context) {
        throw new Error('useAgentContext must be used within an AgentClientProvider');
    }
    return context;
}

