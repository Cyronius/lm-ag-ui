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
    ToolCallResultEvent,
    StateSnapshotEvent    
} from '@ag-ui/core';

import {
    ToolCallBuffer,
    ArtifactData,
    AgentSubscriber
} from '../types/index';
import { v4 as uuidv4 } from 'uuid';
import { createUnifiedTools, getToolHandlers, getToolRenderers, ToolHandler, ToolRenderer } from '../tools/unifiedTools';
import { AgentClient } from '../services/AgentClient';

interface useAgent {
    onMessageComplete: (message: Message) => void;
    onErrorMessage: (message: Message) => void;
    setArtifacts: React.Dispatch<React.SetStateAction<Map<string, ArtifactData>>>;
    agentClient: AgentClient;
}


export function useAgent({ onMessageComplete, onErrorMessage, setArtifacts, agentClient }: useAgent) {
    
    
    // Agent streaming state
    const [isStreaming, setIsStreaming] = useState(false);
    
    let currentMessage = ''
    let currentMessageId: string | null = null

    // Tool execution state (now using ref)
    const toolCallBuffersRef = useRef<Map<string, ToolCallBuffer>>(new Map());
    // Helper to force re-render if needed
    const [, forceUpdate] = useState(0);

    // Create unified tools with required context
    const unifiedTools = createUnifiedTools({ setArtifacts });
    const toolHandlers = getToolHandlers(unifiedTools);
    const toolRenderers = getToolRenderers(unifiedTools);

    // Tool execution handlers
    const handleToolCallStart = useCallback((event: ToolCallStartEvent) => {        
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
            // await agentService.executeBackendTool(
            //     { toolCallId, toolName, args },
            //     agentSubscriber
            // );            
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
    }, [agentClient, onErrorMessage]);

    const handleToolCallEnd = useCallback((event: ToolCallEndEvent) => {        
        const toolCall = toolCallBuffersRef.current.get(event.toolCallId);        
        if (toolCall) {
            if (toolHandlers.has(toolCall.name)) {
                console.log('frontend tool call', toolCall)
                executeFrontendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
            }
            else {                
                // Backend tool - execute on server
                console.log('backend tool call', toolCall)
                executeBackendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
            }
            toolCallBuffersRef.current.delete(event.toolCallId);
            forceUpdate(n => n + 1);
        }
    }, [toolHandlers, toolRenderers, executeBackendTool]);

    const handleToolCallResult = useCallback((event: ToolCallResultEvent) => {
        console.log('Received tool call result:', event);
        
        try {
            // Create proper ToolMessage from ToolCallResult event
            const toolResultMessage: Message = {
                id: `tool_result_${event.toolCallId}_${Date.now()}`,
                role: 'tool',
                content: event.content || '',
                toolCallId: event.toolCallId
            };
            onMessageComplete(toolResultMessage);
        } catch (error) {
            console.error('Error creating tool result message:', error);
            const errorMessage: Message = {
                id: `error_tool_${event.toolCallId}_${Date.now()}`,
                role: 'assistant',
                content: 'Error processing tool result'
            };
            onErrorMessage(errorMessage);
        }
    }, [onMessageComplete, onErrorMessage]);

    const submitToolResultToServer = useCallback(async (toolCallId: string, content: string) => {
        try {
            const toolMessage: Message = {
                id: `tool_${Date.now()}_${uuidv4().slice(0, 8)}`,
                role: "tool",
                content,
                toolCallId
            };

            // Submit result back to server to continue agent execution            
            await agentClient.submitToolResult(toolMessage, agentSubscriber);
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
    }, [agentClient, onErrorMessage]);

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
                
                // Create proper ToolMessage for this frontend tool execution
                const toolMessage: Message = {
                    id: `tool_${toolCallId}_${Date.now()}`,
                    role: 'tool',
                    content: result,
                    toolCallId
                };
                onMessageComplete(toolMessage);
                
                // Submit result back to server to continue agent execution                
                await submitToolResultToServer(toolCallId, result);
            }
        } catch (error) {
            console.error(`Tool execution error for ${toolName}:`, error);
            const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            
            // Create error ToolMessage
            const errorToolMessage: Message = {
                id: `tool_error_${toolCallId}_${Date.now()}`,
                role: 'tool',
                content: errorMessage,
                toolCallId
            };
            onMessageComplete(errorToolMessage);
            
            await submitToolResultToServer(toolCallId, errorMessage);
        }
    }, [toolHandlers, toolRenderers, submitToolResultToServer, onMessageComplete]);


    // Combined AgentSubscriber - recreate on every render to avoid stale closures
    const agentSubscriber: AgentSubscriber = {
        onEvent: ({ event }: { event: any }): void => {                        
            if (event.type !== 'TEXT_MESSAGE_CONTENT') {
                console.log('EVENT RECEIVED: ', event)
            }
        },
        onRunStartedEvent: ({ event }: { event: RunStartedEvent }) => {
            setIsStreaming(true);
            currentMessage = ''
            currentMessageId = null
        },
        onTextMessageContentEvent: ({ event }: { event: TextMessageContentEvent }) => {
            if (event.messageId !== currentMessageId) {
                currentMessageId = event.messageId
                currentMessage = event.delta;
            } else {
                currentMessage += event.delta
            }
        },
        onStateSnapshotEvent: ({ event }: { event: StateSnapshotEvent }) => {
            // TODO: Handle state snapshot events if needed in the future
            console.log('State snapshot received:', event.snapshot);
        },
        onRunFinishedEvent: ({ event }: { event: RunFinishedEvent }) => {
            try {
                if (currentMessage.trim()) {
                    const completedMessage: Message = {
                        id: currentMessageId || `msg_${Date.now()}`,
                        role: 'assistant',
                        content: currentMessage
                    };
                    onMessageComplete(completedMessage);
                }
            } catch (error) {
                console.error('Error creating assistant message:', error);
                const errorMessage: Message = {
                    id: `error_${Date.now()}`,
                    role: 'assistant', 
                    content: 'Error processing assistant response'
                };
                onErrorMessage(errorMessage);
            } finally {
                setIsStreaming(false);
                currentMessage = ''
                currentMessageId = null
                agentClient.endRun();
            }
        },
        onRunErrorEvent: ({ event }: { event: RunErrorEvent }) => {
            setIsStreaming(false);
            currentMessage = ''
            currentMessageId = null
            const errorMessage: Message = {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `Error: ${event.message}`
            };
            onErrorMessage(errorMessage);
            agentClient.endRun();
        },
        onToolCallStartEvent: ({ event }: { event: ToolCallStartEvent }) => handleToolCallStart(event),
        onToolCallArgsEvent: ({ event }: { event: ToolCallArgsEvent }) => handleToolCallArgs(event),
        onToolCallEndEvent: ({ event }: { event: ToolCallEndEvent }) => handleToolCallEnd(event),
        onToolCallResultEvent: ({ event }: { event: ToolCallResultEvent }) => handleToolCallResult(event)
    };

    const resetStreaming = useCallback(() => {
        setIsStreaming(false);
        currentMessage = ''
        currentMessageId = null
    }, []);

    return {
        agentSubscriber,
        isStreaming,
        currentMessage: currentMessage,
        currentMessageId: currentMessageId,
        toolCallBuffers: toolCallBuffersRef.current,
        toolHandlers,
        toolRenderers,
        resetStreaming
    };
}
