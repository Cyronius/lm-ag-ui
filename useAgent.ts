import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AgentClient } from './AgentClient';
import { ToolDefinition, ToolCallBuffer, Session, AgentClientContextValue, UseAgentOptions } from './index';
import {
    AgentSubscriber,
    Message,
    TextMessageStartEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
    ToolCall,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    StateSnapshotEvent
} from '@ag-ui/client';
import { v4 as uuidv4 } from 'uuid';
import { getFrontEndTools } from './toolUtils';

const SAFETY_TIMEOUT_MS = 120000;

export function useAgent({
    baseUrl,
    agentId,
    tokenProvider,
    timeout,
    tools = {},
    buildForwardedProps
}: UseAgentOptions): AgentClientContextValue {
    // Create a single AgentClient instance
    const [agentClient] = useState(() => new AgentClient(baseUrl, agentId, { tokenProvider, timeout }));

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

    // Track messages for terminate/rollback
    const messagesRef = useRef<Message[]>([]);
    const preRunMessageCountRef = useRef<number>(0);

    const [isStreaming, setIsStreaming] = useState<boolean>(false);

    // Debug mode state for LLM input capture
    const [debug, setDebugState] = useState<boolean>(false);

    const setDebug = useCallback((enabled: boolean) => {
        agentClient.setDebug(enabled);
        setDebugState(enabled);
    }, [agentClient]);

    // Tool execution state (using refs to avoid stale closures)
    const toolCallBuffersRef = useRef<Map<string, ToolCallBuffer>>(new Map());
    const toolCallIdToNameRef = useRef<Map<string, string>>(new Map());
    const isAbortedRef = useRef<boolean>(false);
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

    // Safety timeout: force-end runs stuck for over 2 minutes
    useEffect(() => {
        if (!session.isActive) return;
        const timeoutId = setTimeout(() => {
            console.warn('[AG-UI] Safety timeout: forcing run end after 120s');
            currentMessageRef.current = '';
            setCurrentMessage('');
            setCurrentMessageId(null);
            toolCallBuffersRef.current.clear();
            agentClient.endRun();
            addMessage({
                id: `timeout_${Date.now()}`,
                role: 'assistant',
                content: 'The request timed out. Please try again.'
            });
        }, SAFETY_TIMEOUT_MS);
        return () => clearTimeout(timeoutId);
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
        messagesRef.current = [...messagesRef.current, message];
        setMessages(messagesRef.current);
    }, []);

    const clearMessages = useCallback(() => {
        messagesRef.current = [];
        setMessages([]);
    }, []);

    const terminateRun = useCallback(() => {
        // Flag so onRunErrorEvent knows this was intentional
        isAbortedRef.current = true;
        // Abort the HTTP SSE stream
        agentClient.abortRun();

        // Clear streaming state
        currentMessageRef.current = '';
        setCurrentMessage('');
        setCurrentMessageId(null);
        toolCallBuffersRef.current.clear();
        toolCallIdToNameRef.current.clear();

        // Remove messages from the current run
        const keepCount = preRunMessageCountRef.current;
        messagesRef.current = messagesRef.current.slice(0, keepCount);
        setMessages(messagesRef.current);
    }, [agentClient]);

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

            // Mark as completed so onRunFinishedEvent still sees it for toolCalls,
            // but handlePendingToolCalls skips it.
            const entry = toolCallBuffersRef.current.get(event.toolCallId);
            if (entry) {
                toolCallBuffersRef.current.set(event.toolCallId, { ...entry, resultReceived: true });
            }
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
        onTextMessageStartEvent: ({ event }: { event: TextMessageStartEvent }) => {},
        onTextMessageContentEvent: ({ event }: { event: TextMessageContentEvent }) => {},
        onTextMessageEndEvent: ({ event }: { event: TextMessageEndEvent }) => {},
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
        // nothing needed here right now.
    };

    agentSubscriberRef.current.onRunStartedEvent = ({ event }: { event: RunStartedEvent }) => {
        console.info('[AG-UI] RunStarted:', { 
            threadId: event.threadId, 
            runId: event.runId, 
            message: messages.slice(-1)[0]?.content
        });
        // Snapshot message count before this run (minus 1 to exclude the user message added before startNewRun)
        preRunMessageCountRef.current = Math.max(0, messagesRef.current.length - 1);
        // Notify tracking system that interaction started (for app-level tracking like HubSpot)
        if ((window as any).__smarketingTracking?.startInteraction) {
            (window as any).__smarketingTracking.startInteraction();
        }
        currentMessageRef.current = '';
        setCurrentMessage('');
        setCurrentMessageId(null);
    };

    agentSubscriberRef.current.onTextMessageStartEvent = ({ event }: { event: TextMessageStartEvent }) => {
        console.info('[AG-UI] TextMessageStart:', { messageId: event.messageId, role: event.role });
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

    agentSubscriberRef.current.onTextMessageEndEvent = ({ event }: { event: TextMessageEndEvent }) => {
        console.info('[AG-UI] TextMessageEnd:', { messageId: event.messageId });
    };

    agentSubscriberRef.current.onStateSnapshotEvent = ({ event }: { event: StateSnapshotEvent }) => {
        console.info('[AG-UI] StateSnapshot:', { snapshot: event.snapshot });
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
        console.info('[AG-UI] RunFinished:', { event });
        try {

            // Get the final text from the ref buffer, which avoids a race condition
            // where the connection closes before all messages are received and processed.
            const finalText = currentMessageRef.current.trim();
            const hasPendingToolCalls = toolCallBuffersRef.current.size > 0;

            if (finalText || hasPendingToolCalls) {
                // Build toolCalls array from pending tool call buffers so the
                // assistant message includes them. Without this, the message
                // history has orphaned tool results that OpenAI rejects.
                let toolCalls: ToolCall[] | undefined;
                if (hasPendingToolCalls) {
                    toolCalls = Array.from(toolCallBuffersRef.current.entries()).map(
                        ([toolCallId, toolCall]) => ({
                            id: toolCallId,
                            type: 'function' as const,
                            function: {
                                name: toolCall.name,
                                arguments: toolCall.argsBuffer || '{}'
                            }
                        })
                    );
                }

                const completedMessage: Message = {
                    id: currentMessageId || `msg_${Date.now()}`,
                    role: 'assistant',
                };
                if (finalText) {
                    completedMessage.content = finalText;
                }
                if (toolCalls) {
                    completedMessage.toolCalls = toolCalls;
                }
                console.info('message:', finalText || '(tool calls only)');
                addMessage(completedMessage);

                // Notify tracking system of message (for app-level tracking like HubSpot)
                if (finalText && (window as any).__smarketingTracking?.addMessage) {
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
                // Backend tools already handled via TOOL_CALL_RESULT events
                if (toolCall.resultReceived) continue;

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
                const toolDefs = Object.values(tools).map((t: any) => t.definition);
                agentClient.startNewRun();
                // Send full message history (not just tool results) so stateless backends have context
                agentClient.submitToolResults(messagesRef.current, agentSubscriberRef.current, toolDefs, getForwardedProps())
                    .catch((error: any) => {
                        console.error('Tool result submission failed:', error);
                        agentClient.endRun();
                        addErrorMessage(`Failed to submit tool results: ${error}`);
                    });
            }
        }
    }

    agentSubscriberRef.current.onRunErrorEvent = ({ event }: { event: RunErrorEvent }) => {
        console.info('[AG-UI] RunError:', { message: event.message });
        // Don't show error messages for intentional aborts
        if (isAbortedRef.current) {
            isAbortedRef.current = false;
            console.info('[AG-UI] Run aborted by user');
            return;
        }
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

    agentSubscriberRef.current.onToolCallStartEvent = ({ event }: { event: ToolCallStartEvent }) => {
        console.info('[AG-UI] ToolCallStart:', { toolCallId: event.toolCallId, toolCallName: event.toolCallName, parentMessageId: event.parentMessageId });
        handleToolCallStart(event);
    };
    agentSubscriberRef.current.onToolCallArgsEvent = ({ event }: { event: ToolCallArgsEvent }) => {
        console.info('[AG-UI] ToolCallArgs:', { toolCallId: event.toolCallId, delta: event.delta });
        handleToolCallArgs(event);
    };
    agentSubscriberRef.current.onToolCallEndEvent = ({ event }: { event: ToolCallEndEvent }) => {
        console.info('[AG-UI] ToolCallEnd:', { toolCallId: event.toolCallId });
    };
    agentSubscriberRef.current.onToolCallResultEvent = ({ event }: { event: ToolCallResultEvent }) => {
        console.info('[AG-UI] ToolCallResult:', { toolCallId: event.toolCallId, content: event.content });
        handleToolCallResult(event);
    };

    return {
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
        terminateRun,
        debug,
        setDebug,
        getForwardedProps
    };
}
