import { useRef, useState, useCallback, useEffect } from 'react';
import {
    Message,
    TextMessageContentEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent
} from '@ag-ui/core';
import {
    ToolCallBuffer,
    ArtifactData,
    AgentSubscriber
} from '../types/index';
import { v4 as uuidv4 } from 'uuid';
import { createUnifiedTools, getToolHandlers, getToolRenderers, ToolHandler, ToolRenderer } from '../tools/unifiedTools';
import { AgentService } from '../services/AgentService';

interface useAgent {
    onMessageComplete: (message: Message) => void;
    onErrorMessage: (message: Message) => void;
    setArtifacts: React.Dispatch<React.SetStateAction<Map<string, ArtifactData>>>;
    endRun: () => void;
    agentService: AgentService;
    sessionState: { threadId: string | null; runId: string | null };
}


export function useAgent({ onMessageComplete, onErrorMessage, setArtifacts, endRun, agentService, sessionState }: useAgent) {
    // Agent streaming state
    const [isStreaming, setIsStreaming] = useState(false);
    const [currentMessageState, setCurrentMessageState] = useState('');
    const [currentMessageIdState, setCurrentMessageIdState] = useState<string | null>(null);
    let currentMessage = currentMessageState;
    let currentMessageId = currentMessageIdState;

    // Tool execution state (now using ref)
    const toolCallBuffersRef = useRef<Map<string, ToolCallBuffer>>(new Map());
    // Helper to force re-render if needed
    const [, forceUpdate] = useState(0);

    // Create unified tools with required context
    const unifiedTools = createUnifiedTools({ setArtifacts });
    const toolHandlers = getToolHandlers(unifiedTools);
    const toolRenderers = getToolRenderers(unifiedTools);

    //console.log('map', toolCallBuffersRef.current)

    // Tool execution handlers
    const handleToolCallStart = useCallback((event: ToolCallStartEvent) => {
        console.log('adding tool call', event.toolCallId)
        toolCallBuffersRef.current.set(event.toolCallId, {
            name: event.toolCallName,
            argsBuffer: "",
            parentMessageId: event.parentMessageId
        });
        forceUpdate(n => n + 1); // trigger re-render if UI depends on this
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

    const executeBackendTool = useCallback(async (toolName: string, argsJson: string, toolCallId: string) => {
        try {
            const args = JSON.parse(argsJson);
            // Send tool call to server for execution
            if (agentSubscriberRef.current) {
                await agentService.executeBackendTool(
                    { toolCallId, toolName, args },
                    agentSubscriberRef.current,
                    sessionState
                );
            } else {
                throw new Error('Agent subscriber not available');
            }
            console.log(`Backend tool ${toolName} submitted for execution`);
        } catch (error) {
            console.error(`Backend tool execution error for ${toolName}:`, error);
            // Create error message for the conversation
            const errorMessage: Message = {
                id: `error_${Date.now()}_${uuidv4().slice(0, 8)}`,
                role: 'assistant',
                content: `Backend tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
            onErrorMessage(errorMessage);
        }
    }, [agentService, sessionState, onErrorMessage]);

    const handleToolCallEnd = useCallback((event: ToolCallEndEvent) => {
        console.log('tool call end called for event', event)
        const toolCall = toolCallBuffersRef.current.get(event.toolCallId);
        console.log('tool call', toolCall, toolCallBuffersRef.current)
        if (toolCall) {
            if (toolHandlers.has(toolCall.name)) {
                console.log('frontend tool')
                executeFrontendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
            }
            else {
                console.log('backend tool')
                // Backend tool - execute on server
                executeBackendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
            }
            toolCallBuffersRef.current.delete(event.toolCallId);
            forceUpdate(n => n + 1);
        }
    }, [toolHandlers, toolRenderers, executeBackendTool]);

    const handleToolCallResult = useCallback((event: ToolCallResultEvent) => {
        console.log('Received tool call result:', event);
        
        // We need to find the tool name from our stored tool call buffers
        // Since ToolCallResultEvent might not have toolCallName, we'll try a different approach
        let toolName: string | undefined;
        
        // Try to find any renderer that might match (we could store this mapping earlier)
        // For now, let's use the available properties to try to identify the tool
        // This is a fallback approach since we don't have the exact tool name
        
        // Handle backend tool result - just add to conversation for now
        // We can improve this later when we understand the exact event structure
        
        // Convert to a message and add to conversation
        const toolResultMessage: Message = {
            id: `tool_result_${event.toolCallId}_${Date.now()}`,
            role: 'tool',
            content: event.content,
            toolCallId: event.toolCallId
        };
        onMessageComplete(toolResultMessage);
    }, [toolRenderers, onMessageComplete]);

    const submitToolResultToServer = useCallback(async (toolCallId: string, content: string) => {
        try {
            const toolMessage: Message = {
                id: `tool_${Date.now()}_${uuidv4().slice(0, 8)}`,
                role: "tool",
                content,
                toolCallId
            };

            // Submit result back to server to continue agent execution
            if (agentSubscriberRef.current) {
                await agentService.submitToolResult(toolMessage, agentSubscriberRef.current, sessionState);
            } else {
                throw new Error('Agent subscriber not available');
            }
        } catch (error) {
            console.error('Failed to submit tool result to server:', error);
            // Fallback: add error message to UI
            const errorMessage: Message = {
                id: `error_${Date.now()}_${uuidv4().slice(0, 8)}`,
                role: 'assistant',
                content: `Failed to submit tool result: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
            onErrorMessage(errorMessage);
        }
    }, [agentService, sessionState, onErrorMessage]);

    const executeFrontendTool = useCallback(async (toolName: string, argsJson: string, toolCallId: string) => {
        try {
            const args = JSON.parse(argsJson);
            const handler = toolHandlers.get(toolName);
            if (handler) {
                const result = handler(args);
                
                // Call renderer if it exists (for immediate UI updates)
                const renderer = toolRenderers.get(toolName);
                if (renderer) {
                    renderer(args, result);
                }
                
                // Submit result back to server to continue agent execution
                await submitToolResultToServer(toolCallId, result);
            }
        } catch (error) {
            console.error(`Tool execution error for ${toolName}:`, error);
            const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            await submitToolResultToServer(toolCallId, errorMessage);
        }
    }, [toolHandlers, toolRenderers, submitToolResultToServer]);

    // const sendToolResult = useCallback((toolCallId: string, content: string) => {
    //     const toolMessage: Message = {
    //         id: `tool_${Date.now()}_${uuidv4().slice(0, 8)}`,
    //         role: "tool",
    //         content,
    //         toolCallId
    //     };
    //     onMessageComplete(toolMessage);
    // }, [onMessageComplete]);

    // Combined AgentSubscriber
    const agentSubscriberRef = useRef<AgentSubscriber | null>(null);
    const [shouldClearStreaming, setShouldClearStreaming] = useState(false);
    useEffect(() => {
        if (shouldClearStreaming) {
            setCurrentMessageState('');
            setCurrentMessageIdState(null);
            setShouldClearStreaming(false);
        }
    }, [shouldClearStreaming]);

    if (!agentSubscriberRef.current) {
        agentSubscriberRef.current = {
            onEvent: ({ event }: { event: any }): void => {
                console.log('RECEIVED EVENT', event);
            },
            onRunStartedEvent: ({ event }: { event: RunStartedEvent }) => {
                setIsStreaming(true);
                setCurrentMessageState('');
                setCurrentMessageIdState(null);
            },
            onTextMessageContentEvent: ({ event }: { event: TextMessageContentEvent }) => {
                if (event.messageId !== currentMessageId) {
                    currentMessageId = event.messageId;
                    setCurrentMessageIdState(event.messageId);
                    currentMessage = event.delta;
                    setCurrentMessageState(event.delta);
                } else {
                    currentMessage += event.delta;
                    setCurrentMessageState(currentMessage);
                }
            },
            onRunFinishedEvent: ({ event }: { event: RunFinishedEvent }) => {
                if (currentMessage.trim()) {
                    const completedMessage: Message = {
                        id: currentMessageId || `msg_${Date.now()}`,
                        role: 'assistant',
                        content: currentMessage
                    };
                    onMessageComplete(completedMessage);
                }
                setIsStreaming(false);
                setShouldClearStreaming(true); // Delay clearing until after render
                endRun();
            },
            onRunErrorEvent: ({ event }: { event: RunErrorEvent }) => {
                setIsStreaming(false);
                setShouldClearStreaming(true); // Delay clearing until after render
                const errorMessage: Message = {
                    id: `error_${Date.now()}`,
                    role: 'assistant',
                    content: `Error: ${event.message}`
                };
                onErrorMessage(errorMessage);
                endRun();
            },
            onToolCallStartEvent: ({ event }: { event: ToolCallStartEvent }) => handleToolCallStart(event),
            onToolCallArgsEvent: ({ event }: { event: ToolCallArgsEvent }) => handleToolCallArgs(event),
            onToolCallEndEvent: ({ event }: { event: ToolCallEndEvent }) => handleToolCallEnd(event),
            onToolCallResultEvent: ({ event }: { event: ToolCallResultEvent }) => handleToolCallResult(event)
        };
    }

    const resetStreaming = useCallback(() => {
        setIsStreaming(false);
        setCurrentMessageState('');
        setCurrentMessageIdState(null);
    }, []);

    return {
        agentSubscriber: agentSubscriberRef.current,
        isStreaming,
        currentMessage: currentMessageState,
        currentMessageId: currentMessageIdState,
        toolCallBuffers: toolCallBuffersRef.current,
        toolHandlers,
        toolRenderers,
        resetStreaming
    };
}
