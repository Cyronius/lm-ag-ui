import { useState, useCallback } from 'react';
import {
    Message,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent
} from '@ag-ui/core';
import {
    ToolCallBuffer,
    FrontendToolHandler,
    ArtifactData,
    AgentSubscriber
} from '../types/index';
import { v4 as uuidv4 } from 'uuid';

export const useToolExecution = (
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    setArtifacts: React.Dispatch<React.SetStateAction<Map<string, ArtifactData>>>
) => {
    const [toolCallBuffers, setToolCallBuffers] = useState<Map<string, ToolCallBuffer>>(new Map());

    // Define which tools the frontend can handle
    const frontendToolHandlers = new Map<string, FrontendToolHandler>([
        ['changeBackgroundColor', (args: any) => {
            document.body.style.backgroundColor = args.color;
            return `Background color changed to ${args.color}`;
        }],
        ['showCalendlyWidget', (args: any) => {
            const artifactId = `calendly_${Date.now()}`;
            setArtifacts(prev => new Map(prev).set(artifactId, {
                type: 'calendly',
                url: args.url,
                height: args.height || 600
            }));
            return `Calendly widget displayed`;
        }],
        ['showNotification', (args: any) => {
            if (import.meta.env.REACT_APP_NOTIFICATION_PERMISSION === 'true') {
                if (Notification.permission === 'granted') {
                    new Notification(args.title, { body: args.message });
                    return `Notification shown: ${args.title}`;
                } else if (Notification.permission === 'default') {
                    Notification.requestPermission().then(permission => {
                        if (permission === 'granted') {
                            new Notification(args.title, { body: args.message });
                        }
                    });
                    return `Notification permission requested`;
                } else {
                    return `Notification permission denied`;
                }
            } else {
                return `Notifications disabled in configuration`;
            }
        }]
    ]);

    const handleToolCallStart = useCallback((event: ToolCallStartEvent) => {        
        setToolCallBuffers(prev => new Map(prev).set(event.toolCallId, {
            name: event.toolCallName,
            argsBuffer: "",
            parentMessageId: event.parentMessageId
        }));
    }, []);

    const handleToolCallArgs = useCallback((event: ToolCallArgsEvent) => {        
        setToolCallBuffers(prev => {
            const current = prev.get(event.toolCallId);
            if (current) {
                return new Map(prev).set(event.toolCallId, {
                    ...current,
                    argsBuffer: current.argsBuffer + event.delta
                });
            }
            return prev;
        });
    }, []);

    const handleToolCallEnd = useCallback((event: ToolCallEndEvent) => {        
        const toolCall = toolCallBuffers.get(event.toolCallId);
        if (toolCall) {
            // Check if frontend can handle this tool
            if (frontendToolHandlers.has(toolCall.name)) {
                executeFrontendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
            }
            // Backend tools are handled by backend - no frontend action needed

            setToolCallBuffers(prev => {
                const newMap = new Map(prev);
                newMap.delete(event.toolCallId);
                return newMap;
            });
        }
    }, [toolCallBuffers, frontendToolHandlers]);

    const executeFrontendTool = useCallback((toolName: string, argsJson: string, toolCallId: string) => {
        try {
            const args = JSON.parse(argsJson);
            const handler = frontendToolHandlers.get(toolName);

            if (handler) {
                const result = handler(args);
                sendToolResult(toolCallId, result);
            }
        } catch (error) {
            console.error(`Tool execution error for ${toolName}:`, error);
            sendToolResult(toolCallId, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }, [frontendToolHandlers]);

    const sendToolResult = useCallback((toolCallId: string, content: string) => {
        const toolMessage: Message = {
            id: `tool_${Date.now()}_${uuidv4().slice(0, 8)}`,
            role: "tool",
            content,
            toolCallId
        };

        setMessages(prev => [...prev, toolMessage]);
    }, [setMessages]);

    // Create the subscriber object
    const toolSubscriber: Partial<AgentSubscriber> = {
        onToolCallStartEvent: ({ event }: { event: ToolCallStartEvent }) => handleToolCallStart(event),
        onToolCallArgsEvent: ({ event }: { event: ToolCallArgsEvent }) => handleToolCallArgs(event),
        onToolCallEndEvent: ({ event }: { event: ToolCallEndEvent }) => handleToolCallEnd(event)
    };

    return {
        toolSubscriber,
        frontendToolHandlers,
        toolCallBuffers
    };
};