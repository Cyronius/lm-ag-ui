import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AgentClient } from '../services/AgentClient';
import { ToolDefinition, ToolCallBuffer, AgentSubscriber, RunAgentResult } from '../types/index';
import { 
    Message,
    TextMessageContentEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    StateSnapshotEvent
} from '@ag-ui/core';
import { v4 as uuidv4 } from 'uuid';
import { getFrontEndTools } from '../tools/toolUtils';

// Import Session type from AgentClient since it's now defined there
type Session = {
    threadId: string | null;
    runId: string | null;
    isActive: boolean;
};

interface AgentClientContextValue {
    agentClient: AgentClient;
    session: Session;
    tools: Record<string, ToolDefinition>;
    globalState: any;
    messages: Message[];
    addMessage: (message: Message) => void;
    clearMessages: () => void;
    updateState: (toolName: string, data: any) => void;    
    // Streaming state
    currentMessage: string;
    currentMessageId: string | null;
    isStreaming: boolean;    
    getToolNameFromCallId: (toolCallId: string) => string | undefined;    
    agentSubscriber: AgentSubscriber;
}

const AgentClientContext = createContext<AgentClientContextValue | null>(null);

interface AgentClientProviderProps {
    children: React.ReactNode;
    tools: Record<string, ToolDefinition>;
}

export function AgentClientProvider({ children, tools }: AgentClientProviderProps) {
    // Create a single AgentClient instance
    const [agentClient] = useState(() => new AgentClient());
    
    // Track session for React re-renders
    const [session, setSession] = useState<Session>(agentClient.session);
    
    // Global AG-UI state management
    const [globalState, setGlobalState] = useState<any>({});
    
    // Messages state management
    const [messages, setMessages] = useState<Message[]>([]);

    // Streaming state - centralized here
    const [currentMessage, setCurrentMessage] = useState<string>('');
    const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);

    // Maintain a buffer for the streaming text
    const currentMessageRef = useRef<string>('');
    
    const [isStreaming, setIsStreaming] = useState<boolean>(false);
    
    // Tool execution state (using refs to avoid stale closures)
    const toolCallBuffersRef = useRef<Map<string, ToolCallBuffer>>(new Map());
    const toolCallIdToNameRef = useRef<Map<string, string>>(new Map());
    const [, forceUpdate] = useState(0);

    // Set up the callback when component mounts
    useEffect(() => {
        agentClient.setSessionChangeCallback(setSession);
        setIsStreaming(agentClient.session.isActive);
    }, [agentClient]);

    // Update streaming state when session changes
    useEffect(() => {
        setIsStreaming(session.isActive);
    }, [session.isActive]);

    // Get frontend tools
    const frontEndTools = useMemo(() => getFrontEndTools(tools), [tools]);

    // TODO: not sure state management by toolname is necessary -- could just expose set and get for global state
    // State management functions - need to be defined first
    const updateState = useCallback((toolName: string, data: any) => {
        setGlobalState((prev: any) => ({
            ...prev,
            [toolName]: data
        }));
    }, []);
    
    const getState = useCallback((toolName?: string) => {
        if (toolName) {
            return globalState[toolName];
        }
        return globalState;
    }, [globalState]);
    
    // Message management functions
    const addMessage = useCallback((message: Message) => {
        setMessages(prev => [...prev, message]);
    }, []);
    
    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    // Tool execution functions - now can reference the above functions
    const executeFrontendTool = useCallback((toolName: string, argsJson: string | null = null, toolCallId: string | null = null):Message|null => {
        if (!toolCallId) {
            toolCallId = uuidv4();
        }
        
        try {
            const args = argsJson ? JSON.parse(argsJson) : null;
            const tool = frontEndTools[toolName];
            
            const result = tool.handler?.(args, updateState, getState);                        
            const toolMessage: Message = {
                id: `tool_${toolCallId}_${Date.now()}`,
                role: 'tool',
                content: result || '{}',
                toolCallId
            };
            addMessage(toolMessage);             
            return toolMessage
            
        } catch (error) {            
            console.error(`Tool execution error for ${toolName}:`, error);            
            const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;            
            addErrorMessage(errorMessage)
            return null
        }
    }, [frontEndTools, updateState, getState, addMessage]);

    
    const executeBackendTool = useCallback((toolName: string, argsJson: string, toolCallId: string):Message|null => {        
        return null
    }, [agentClient]);

    // Event handlers
    const handleToolCallStart = useCallback((event: ToolCallStartEvent) => {
        toolCallBuffersRef.current.set(event.toolCallId, {
            name: event.toolCallName,
            argsBuffer: "",
            parentMessageId: event.parentMessageId
        });
        toolCallIdToNameRef.current.set(event.toolCallId, event.toolCallName);
        forceUpdate(n => n + 1);
    }, []);

    const handleToolCallArgs = useCallback((event: ToolCallArgsEvent) => {
        const current = toolCallBuffersRef.current.get(event.toolCallId);
        if (current) {
            toolCallBuffersRef.current.set(event.toolCallId, {
                ...current,
                argsBuffer: current.argsBuffer + event.delta
            });
            forceUpdate(n => n + 1);
        }
    }, []);

    // const handleToolCallEnd = useCallback((event: ToolCallEndEvent) => {
    //     const toolCall = toolCallBuffersRef.current.get(event.toolCallId);
    //     if (toolCall) {
    //         if (frontEndTools[toolCall.name]) {
    //             executeFrontendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);                
    //         } else {
    //             executeBackendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
    //         }
    //         toolCallBuffersRef.current.delete(event.toolCallId);
    //         forceUpdate(n => n + 1);
    //     }
    // }, [frontEndTools, executeFrontendTool, executeBackendTool]);

    const handleToolCallResult = useCallback((event: ToolCallResultEvent) => {
        try {
            const toolResultMessage: Message = {
                id: `tool_result_${event.toolCallId}_${Date.now()}`,
                role: 'tool',
                content: event.content || '',
                toolCallId: event.toolCallId
            };
            console.log('adding tool call result to messages', toolResultMessage);
            addMessage(toolResultMessage);

            // TODO: delete this tool call id from the ref, I think.
            toolCallBuffersRef.current.delete(event.toolCallId);
        } catch (error) {
            console.error('Error creating tool result message:', error);
            const errorMessage: Message = {
                id: `error_tool_${event.toolCallId}_${Date.now()}`,
                role: 'assistant',
                content: 'Error processing tool result'
            };
            addMessage(errorMessage);
        }
    }, []);

    // Create singleton AgentSubscriber ref to maintain object identity
    const agentSubscriberRef = useRef<AgentSubscriber>({
        onEvent: ({ event }: { event: any }): void => {},
        onRunStartedEvent: ({ event }: { event: RunStartedEvent }) => {},
        onTextMessageContentEvent: ({ event }: { event: TextMessageContentEvent }) => {},
        onStateSnapshotEvent: ({ event }: { event: StateSnapshotEvent }) => {},
        onRunFinishedEvent: ({ event }: { event: RunFinishedEvent }) => {},
        onRunErrorEvent: ({ event }: { event: RunErrorEvent }) => {},
        onToolCallStartEvent: ({ event }: { event: ToolCallStartEvent }) => {},
        onToolCallArgsEvent: ({ event }: { event: ToolCallArgsEvent }) => {},
        onToolCallEndEvent: ({ event }: { event: ToolCallEndEvent }) => {},
        onToolCallResultEvent: ({ event }: { event: ToolCallResultEvent }) => {}
    });

    // Update handlers with fresh closures on each render while keeping same object identity
    agentSubscriberRef.current.onEvent = ({ event }: { event: any }): void => {
        if (event.type !== 'TEXT_MESSAGE_CONTENT') {
            console.log('event received:', event);
        }
    };
    
    agentSubscriberRef.current.onRunStartedEvent = ({ event }: { event: RunStartedEvent }) => {
        currentMessageRef.current = '';
        setCurrentMessage('');
        setCurrentMessageId(null);
    };
    
    agentSubscriberRef.current.onTextMessageContentEvent = ({ event }: { event: TextMessageContentEvent }) => {
        if (event.messageId !== currentMessageId) {
            setCurrentMessageId(event.messageId);            
        } 

        // Add message to buffer
        currentMessageRef.current += event.delta

        // Update UI
        setCurrentMessage(currentMessageRef.current);
        
    };
    
    agentSubscriberRef.current.onStateSnapshotEvent = ({ event }: { event: StateSnapshotEvent }) => {  
        setGlobalState(event.snapshot ?? {})        
    };
    
    agentSubscriberRef.current.onRunFinishedEvent = ({ event }: { event: RunFinishedEvent }) => {
        try {

            // Get the final text from the ref buffer, which avoids a race condition 
            // where the connection closes before all messages are received and processed.
            const finalText = currentMessageRef.current.trim();
            if (finalText) {
                console.log('completed message', finalText)

                const completedMessage: Message = {
                    id: currentMessageId || `msg_${Date.now()}`,
                    role: 'assistant',
                    content: finalText
                };
                addMessage(completedMessage);
            }
        } catch (error) {
            console.error('Error creating assistant message:', error);
            const errorMessage: Message = {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: 'Error processing assistant response'
            };
            addMessage(errorMessage);
        } finally {
            currentMessageRef.current = '';
            setCurrentMessage('');
            setCurrentMessageId(null);
            agentClient.endRun();
        }

        handlePendingToolCalls()
            
    };

    // adds an error message to the chat messages buffer
    function addErrorMessage(error: any) {
        const errorMessage: Message = {
                    id: uuidv4(),
                    role: 'assistant',
                    content: `${error}`
                };
        addMessage(errorMessage)
    }

    function handlePendingToolCalls() {

        // if we have existing tool calls, we need to submit them as a new run
        let toolMessages:Message[] = []
        try {
            for (const [toolCallId, toolCall] of toolCallBuffersRef.current.entries()) {
                let result;
                if (frontEndTools[toolCall.name]) {
                    result = executeFrontendTool(toolCall.name, toolCall.argsBuffer, toolCallId);
                } else {
                    result = executeBackendTool(toolCall.name, toolCall.argsBuffer, toolCallId);
                }
                if (result) {
                    toolMessages.push(result)                    
                }
            }
        } catch (error) {
            addErrorMessage(error)
        }
        finally {
            toolCallBuffersRef.current.clear()
            if (toolMessages.length > 0) {
                agentClient.submitToolResults(toolMessages, agentSubscriberRef.current);
            }
        }
    }
    
    agentSubscriberRef.current.onRunErrorEvent = ({ event }: { event: RunErrorEvent }) => {
        setCurrentMessage('');
        setCurrentMessageId(null);
        const errorMessage: Message = {
            id: `error_${Date.now()}`,
            role: 'assistant',
            content: `Error: ${event.message}`
        };
        addMessage(errorMessage);
        agentClient.endRun();
    };
    
    agentSubscriberRef.current.onToolCallStartEvent = ({ event }: { event: ToolCallStartEvent }) => handleToolCallStart(event);
    agentSubscriberRef.current.onToolCallArgsEvent = ({ event }: { event: ToolCallArgsEvent }) => handleToolCallArgs(event);
    //agentSubscriberRef.current.onToolCallEndEvent = ({ event }: { event: ToolCallEndEvent }) => handleToolCallEnd(event);
    agentSubscriberRef.current.onToolCallResultEvent = ({ event }: { event: ToolCallResultEvent }) => handleToolCallResult(event);

    const contextValue: AgentClientContextValue = {
        agentClient,
        session,
        tools,
        globalState,
        messages,
        addMessage,
        clearMessages,
        updateState,        
        currentMessage,
        currentMessageId,
        isStreaming,        
        getToolNameFromCallId: (toolCallId: string) => toolCallIdToNameRef.current.get(toolCallId),        
        agentSubscriber: agentSubscriberRef.current
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

