import { useRef, useState, useCallback } from 'react';
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
    AgentSubscriber
} from '../types/index';
import { v4 as uuidv4 } from 'uuid';
import { ToolHandler } from '../types/index';
import { getFrontEndTools } from '../tools/toolUtils';
import { AgentClient } from '../services/AgentClient';
import { useAgentContext } from '../contexts/AgentClientContext';

interface Message {
    id: string;
    role: 'developer' | 'assistant' | 'tool';
    content: string;
    name?: string;
    toolCallId?: string;
}

interface useAgent {
    onMessageComplete: (message: Message) => void;
    onErrorMessage: (message: Message) => void;
    agentClient: AgentClient;
}


export function useAgent({ onMessageComplete, onErrorMessage, agentClient }: useAgent) {
    
    let currentMessage = ''
    let currentMessageId: string | null = null

    // Tool execution state (now using ref)
    const toolCallBuffersRef = useRef<Map<string, ToolCallBuffer>>(new Map());
    // Map toolCallId to toolName for later retrieval during rendering
    const toolCallIdToNameRef = useRef<Map<string, string>>(new Map());
    // Helper to force re-render if needed
    const [, forceUpdate] = useState(0);

    // Get everything from unified context
    const { tools, updateState, getState } = useAgentContext();    
    const frontEndTools = getFrontEndTools(tools);

    // Flag to control tool call message injection
    const showToolCallMessages = !!import.meta.env.VITE_SHOW_TOOL_CALL_MESSAGES;

    const handleToolCallStart = useCallback((event: ToolCallStartEvent) => {
        toolCallBuffersRef.current.set(event.toolCallId, {
            name: event.toolCallName,
            argsBuffer: "",
            parentMessageId: event.parentMessageId
        });
        toolCallIdToNameRef.current.set(event.toolCallId, event.toolCallName);
        forceUpdate(n => n + 1);

        // Inject tool call message if enabled
        if (showToolCallMessages) {
            const toolCallMessage: Message = {
                id: `tool_call_${event.toolCallId}_${Date.now()}`,
                role: 'developer',
                content: `TOOL CALL: ${event.toolCallName}`,
                toolCallId: event.toolCallId
            };
            onMessageComplete(toolCallMessage);
        }
    }, [onMessageComplete, showToolCallMessages]);

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
            const args = argsJson ? JSON.parse(argsJson) : argsJson
            
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
            if (frontEndTools[toolCall.name]) {
                executeFrontendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);                
            } else {
                executeBackendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
            }
            toolCallBuffersRef.current.delete(event.toolCallId);
            forceUpdate(n => n + 1);
        }
    }, [frontEndTools, executeBackendTool]);

    const handleToolCallResult = useCallback((event: ToolCallResultEvent) => {
        try {
            // Create proper ToolMessage from ToolCallResult event
            const toolResultMessage: Message = {
                id: `tool_result_${event.toolCallId}_${Date.now()}`,
                role: 'tool',
                content: event.content || '',
                toolCallId: event.toolCallId
            };
            console.log('adding tool call result to messages', toolResultMessage)
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

            // Only call submitToolResult if it exists
            if (typeof agentClient.submitToolResult === "function") {
                await agentClient.submitToolResult(toolMessage, agentSubscriber);
            } else {
                // Prevent error and optionally log a warning
                console.warn("agentClient.submitToolResult is not implemented yet.");
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
    }, [agentClient, onErrorMessage]);

    const executeFrontendTool = useCallback(async (toolName: string, argsJson: string, toolCallId: string) => {
        try {
            const args = argsJson ? JSON.parse(argsJson) : argsJson           
            const tool = frontEndTools[toolName];
            if (tool?.handler) {
                const result = tool.handler(args, updateState, getState);
                
                // Create proper ToolMessage for this frontend tool execution
                const toolMessage: Message = {
                    id: `tool_${toolCallId}_${Date.now()}`,
                    role: 'tool',
                    content: result,
                    toolCallId
                };
                onMessageComplete(toolMessage);
                
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
    }, [frontEndTools, submitToolResultToServer, onMessageComplete, updateState, getState]);


    // Combined AgentSubscriber - recreate on every render to avoid stale closures
    const agentSubscriber: AgentSubscriber = {
        onEvent: ({ event }: { event: any }): void => {
            // Handle any custom event processing if needed
            
            if (event.type !== 'TEXT_MESSAGE_CONTENT') {
                console.log('event received:', event)
            }

        },
        onRunStartedEvent: ({ event }: { event: RunStartedEvent }) => {
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
            // Handle state snapshot events from AG-UI server
            if (event.snapshot) {

                // TODO: store state

            }
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
                currentMessage = ''
                currentMessageId = null
                agentClient.endRun();
            }
        },
        onRunErrorEvent: ({ event }: { event: RunErrorEvent }) => {
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

    
    return {
        agentSubscriber,
        isStreaming: agentClient.session.isActive,
        currentMessage: currentMessage,
        currentMessageId: currentMessageId,
        toolCallBuffers: toolCallBuffersRef.current,
        getToolNameFromCallId: (toolCallId: string) => toolCallIdToNameRef.current.get(toolCallId),
    };
}