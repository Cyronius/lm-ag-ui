import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AgentClient } from './AgentClient';
import { ToolDefinition, ToolCallBuffer, AgentSubscriber, Session, AgentClientContextValue, AgentClientProviderProps } from './index';
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
import { getFrontEndTools } from './toolUtils';

const AgentClientContext = createContext<AgentClientContextValue | null>(null);

export function AgentClientProvider({
    children,
    tools = {},
    baseUrl,
    agentId,
    buildForwardedProps
}: AgentClientProviderProps) {
    // Create a single AgentClient instance
    const [agentClient] = useState(() => new AgentClient(baseUrl, agentId));

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

    // Get frontend tools (empty object if no tools provided)
    const frontEndTools = useMemo(() => getFrontEndTools(tools), [tools]);

    // Keep a ref to the latest globalState to avoid stale closures in getState
    const globalStateRef = useRef(globalState);
    useEffect(() => {
        globalStateRef.current = globalState;
    }, [globalState]);

    // State management functions - need to be defined first
    const updateState = useCallback((toolName: string, data: any) => {
        setGlobalState((prev: any) => ({
            ...prev,
            [toolName]: data
        }));
    }, []);

    const getState = useCallback((toolName?: string) => {
        // Read from ref to always get the latest state
        if (toolName) {
            return globalStateRef.current[toolName];
        }
        return globalStateRef.current;
    }, []); // No dependencies - always reads from ref

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

            // Pass configJson directly as 4th parameter
            const result = tool.handler?.(args, updateState, getState, tool.configJson);
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
            const errorDetail = error instanceof Error ? error.message : String(error);
            addErrorMessage(`Error executing tool '${toolName}': ${errorDetail}`)
            return null
        }
    }, [frontEndTools, updateState, getState, addMessage]);


    const executeBackendTool = useCallback((toolName: string, argsJson: string, toolCallId: string):Message|null => {
        // TODO: we should allow frontend handler calls for backend tools.
        return null
    }, [agentClient]);

    // Build forwardedProps for agent calls using callback + any additional props
    const getForwardedProps = useCallback((extraProps?: Record<string, any>): Record<string, any> => {
        const baseProps = buildForwardedProps?.() ?? {};
        return { ...baseProps, ...extraProps };
    }, [buildForwardedProps]);

    const invokeToolByName = useCallback(async (
        toolName: string,
        additionalForwardedProps?: Record<string, any>,
        stateUpdates?: Record<string, any>
    ): Promise<void> => {
        // Validate tool exists
        const tool = tools[toolName];
        if (!tool) {
            console.error(`Tool ${toolName} not found`);
            const errorMessage: Message = {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `Error: Tool '${toolName}' not found`
            };
            addMessage(errorMessage);
            return;
        }

        // Create user message requesting tool invocation
        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: `invoke the ${toolName} tool. Parameters=${JSON.stringify(additionalForwardedProps || {})}`
        };

        // Start new run
        agentClient.startNewRun();

        try {
            // Apply state updates if provided
            if (stateUpdates) {
                // Update local React state immediately so renderers have access to the values
                setGlobalState((prev: any) => ({ ...prev, ...stateUpdates }));
                // Also send to backend
                agentClient.setState({
                    ...globalState,
                    ...stateUpdates
                });
            }

            // Build forwardedProps using callback + any additional props
            const forwardedProps = getForwardedProps(additionalForwardedProps);

            await agentClient.runAgent(
                [...messages, userMessage],
                [tool.definition], // Only pass the specific tool
                agentSubscriberRef.current,
                forwardedProps
            );
        } catch (error) {
            console.error('Agent execution failed:', error);
            const errorMessage: Message = {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `Error executing tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`
            };
            addMessage(errorMessage);
            throw error;
        }
    }, [agentClient, tools, messages, globalState, addMessage, getForwardedProps]);

    // Event handlers
    const handleToolCallStart = useCallback((event: ToolCallStartEvent) => {
        toolCallBuffersRef.current.set(event.toolCallId, {
            name: event.toolCallName,
            argsBuffer: "",
            parentMessageId: event.parentMessageId
        });
        toolCallIdToNameRef.current.set(event.toolCallId, event.toolCallName);

        // Notify tracking system of tool usage (for app-level tracking like HubSpot)
        if ((window as any).__smarketingTracking?.addToolUsed) {
            (window as any).__smarketingTracking.addToolUsed(event.toolCallName);
        }

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

    const handleToolCallResult = useCallback((event: ToolCallResultEvent) => {
        try {
            const toolResultMessage: Message = {
                id: `tool_result_${event.toolCallId}_${Date.now()}`,
                role: 'tool',
                content: event.content || '',
                toolCallId: event.toolCallId
            };
            addMessage(toolResultMessage);

            // Call tool's onResult callback for side effects (e.g., accumulation)
            const toolCall = toolCallBuffersRef.current.get(event.toolCallId);
            if (toolCall) {
                const tool = tools[toolCall.name];
                if (tool?.onResult) {
                    try {
                        const args = JSON.parse(toolCall.argsBuffer || '{}');
                        tool.onResult(args, event.content || '', updateState, getState);
                    } catch (error) {
                        console.error(`Error calling onResult for tool ${toolCall.name}:`, error);
                    }
                }
            }

            // TODO: delete this tool call id from the ref, I think.
            toolCallBuffersRef.current.delete(event.toolCallId);
        } catch (error) {
            console.error('Error creating tool result message:', error);
            const errorDetail = error instanceof Error ? error.message : String(error);
            const errorMessage: Message = {
                id: `error_tool_${event.toolCallId}_${Date.now()}`,
                role: 'assistant',
                content: `Error processing tool result: ${errorDetail}`
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
    agentSubscriberRef.current.onEvent = (): void => {
        // Event handler - can be used for debugging
    };

    agentSubscriberRef.current.onRunStartedEvent = ({ event }: { event: RunStartedEvent }) => {
        // Notify tracking system that interaction started (for app-level tracking like HubSpot)
        if ((window as any).__smarketingTracking?.startInteraction) {
            (window as any).__smarketingTracking.startInteraction();
        }
        currentMessageRef.current = '';
        setCurrentMessage('');
        setCurrentMessageId(null);
    };

    agentSubscriberRef.current.onTextMessageContentEvent = ({ event }: { event: TextMessageContentEvent }) => {
        if (event.messageId !== currentMessageId) {
            setCurrentMessageId(event.messageId);
        }

        // Accumulate streaming text
        currentMessageRef.current += event.delta;

        // Update state for Streamdown to render (Streamdown handles streaming markdown natively)
        setCurrentMessage(currentMessageRef.current);
    };

    agentSubscriberRef.current.onStateSnapshotEvent = ({ event }: { event: StateSnapshotEvent }) => {
        // Merge the snapshot with existing state, but preserve frontend-managed keys
        // Frontend-managed keys start with underscore (e.g., _soco_accumulated_outlines)
        setGlobalState((prev: any) => {
            const merged = { ...prev, ...event.snapshot };

            // Preserve any frontend-managed keys (starting with _) from prev state
            Object.keys(prev).forEach(key => {
                if (key.startsWith('_')) {
                    merged[key] = prev[key];
                }
            });

            return merged;
        });
    };

    agentSubscriberRef.current.onRunFinishedEvent = ({ event }: { event: RunFinishedEvent }) => {
        try {

            // Get the final text from the ref buffer, which avoids a race condition
            // where the connection closes before all messages are received and processed.
            const finalText = currentMessageRef.current.trim();
            if (finalText) {
                const completedMessage: Message = {
                    id: currentMessageId || `msg_${Date.now()}`,
                    role: 'assistant',
                    content: finalText
                };
                addMessage(completedMessage);

                // Notify tracking system of topics and message (for app-level tracking like HubSpot)
                if ((window as any).__smarketingTracking?.addTopics) {
                    (window as any).__smarketingTracking.addTopics(finalText);
                }
                if ((window as any).__smarketingTracking?.addMessage) {
                    (window as any).__smarketingTracking.addMessage('assistant', finalText);
                }
            }
        } catch (error) {
            console.error('Error creating assistant message:', error);
            const errorDetail = error instanceof Error ? error.message : String(error);
            const errorMessage: Message = {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `Error processing assistant response: ${errorDetail}`
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
        agentSubscriber: agentSubscriberRef.current,
        invokeToolByName,
        getForwardedProps
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
