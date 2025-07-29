import { useContext } from 'react';
import { AgentClientContext } from '../contexts/AgentClientContext';

export function useAgentClient() {
    const context = useContext(AgentClientContext);
    
    if (!context) {
        throw new Error('useAgentClient must be used within an AgentClientProvider');
    }
    
    return context.agentClient;
}
