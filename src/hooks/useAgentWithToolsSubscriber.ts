import { useRef, useState, useCallback } from 'react';
import {
    Message,
    TextMessageContentEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
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

interface UseAgentWithToolsSubscriberOptions {
    onMessageComplete: (message: Message) => void;
    onErrorMessage: (message: Message) => void;
    setArtifacts: React.Dispatch<React.SetStateAction<Map<string, ArtifactData>>>;
    endRun: () => void;
}

export function useAgentWithToolsSubscriber({ onMessageComplete, onErrorMessage, setArtifacts, endRun }: UseAgentWithToolsSubscriberOptions) {
    // Agent streaming state
    const [isStreaming, setIsStreaming] = useState(false);
    const [currentMessage, setCurrentMessage] = useState('');
    const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
    const currentMessageIdRef = useRef<string | null>(null);

    // Tool execution state
    const [toolCallBuffers, setToolCallBuffers] = useState<Map<string, ToolCallBuffer>>(new Map());
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

    // Tool execution handlers
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
            if (frontendToolHandlers.has(toolCall.name)) {
                executeFrontendTool(toolCall.name, toolCall.argsBuffer, event.toolCallId);
            }
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
        onMessageComplete(toolMessage);
    }, [onMessageComplete]);

    // Combined AgentSubscriber
    const agentSubscriberRef = useRef<AgentSubscriber | null>(null);
    if (!agentSubscriberRef.current) {
        agentSubscriberRef.current = {
            onEvent: ({ event }: { event: any }): void => {
                console.log('RECEIVED EVENT', event);
            },
            onRunStartedEvent: ({ event }: { event: RunStartedEvent }) => {
                setIsStreaming(true);
                setCurrentMessage('');
                setCurrentMessageId(null);
                currentMessageIdRef.current = null;
            },
            onTextMessageContentEvent: ({ event }: { event: TextMessageContentEvent }) => {
                if (event.messageId !== currentMessageIdRef.current) {
                    setCurrentMessageId(event.messageId);
                    currentMessageIdRef.current = event.messageId;
                    setCurrentMessage(event.delta);
                } else {
                    setCurrentMessage(prev => prev + event.delta);
                }
            },
            onRunFinishedEvent: ({ event }: { event: RunFinishedEvent }) => {
                if (currentMessage.trim()) {
                    const completedMessage: Message = {
                        id: currentMessageIdRef.current || `msg_${Date.now()}`,
                        role: 'assistant',
                        content: currentMessage
                    };
                    onMessageComplete(completedMessage);
                }
                setIsStreaming(false);
                setCurrentMessage('');
                setCurrentMessageId(null);
                currentMessageIdRef.current = null;
                endRun();
            },
            onRunErrorEvent: ({ event }: { event: RunErrorEvent }) => {
                setIsStreaming(false);
                setCurrentMessage('');
                setCurrentMessageId(null);
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
            onToolCallEndEvent: ({ event }: { event: ToolCallEndEvent }) => handleToolCallEnd(event)
        };
    }

    const resetStreaming = useCallback(() => {
        setIsStreaming(false);
        setCurrentMessage('');
        setCurrentMessageId(null);
        currentMessageIdRef.current = null;
    }, []);

    return {
        agentSubscriber: agentSubscriberRef.current,
        isStreaming,
        currentMessage,
        currentMessageId,
        toolCallBuffers,
        frontendToolHandlers,
        resetStreaming
    };
}
