import React, { useState, useRef, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import { Send } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import ChatMessages from './ChatMessages';
import { ArtifactRenderer } from './artifacts';
import './ChatInterface.css';
import {
    Message,
    TextMessageContentEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent
} from '@ag-ui/core';
import { ArtifactData, AgentSubscriber } from '../types/index';
import { AgentService } from '../services/AgentService';
import { useSessionManager } from '../hooks/useSessionManager';
import { useToolExecution } from '../hooks/useToolExecution';
import { allTools } from '../tools/frontendTools';

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [currentMessage, setCurrentMessage] = useState('');
    const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
    const currentMessageIdRef = useRef<string | null>(null);
    const [artifacts, setArtifacts] = useState<Map<string, ArtifactData>>(new Map());

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const agentService = useRef(new AgentService());

    const { sessionState, startNewRun, endRun } = useSessionManager();
    const { toolSubscriber } = useToolExecution(setMessages, setArtifacts);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, currentMessage]);

    // Create the AG-UI subscriber
    const agentSubscriber: AgentSubscriber = {
        onRunStartedEvent: ({ event }: { event: RunStartedEvent }) => {
            setIsStreaming(true);
            setCurrentMessage('');
            setCurrentMessageId(null);
            currentMessageIdRef.current = null;
        },

        onTextMessageContentEvent: ({ event }: { event: TextMessageContentEvent }) => {
            if (event.messageId !== currentMessageIdRef.current) {
                console.log(`NEW event message id: ${event.messageId} contents: ${event.delta}`)
                // New message started
                setCurrentMessageId(event.messageId);
                currentMessageIdRef.current = event.messageId;
                setCurrentMessage(event.delta);
            } else {
                // Continue current message
                console.log(`CONTINUE event message id: ${event.messageId} contents: ${event.delta}`)
                setCurrentMessage(prev => prev + event.delta);
            }
        },

        onRunFinishedEvent: ({ event }: { event: RunFinishedEvent }) => {
            if (currentMessage.trim()) {
                // Add the completed message
                const completedMessage: Message = {
                    id: currentMessageIdRef.current || `msg_${Date.now()}`,
                    role: 'assistant',
                    content: currentMessage
                };
                setMessages(prev => [...prev, completedMessage]);
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
            setMessages(prev => [...prev, errorMessage]);
            endRun();
        },

        // Include tool execution handlers
        ...toolSubscriber
    };

    const handleSendMessage = async (messageText?: string) => {
        const textToSend = messageText || inputValue;
        if (!textToSend.trim() || isStreaming) return;

        // Add user message
        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: textToSend
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');

        // Start new run
        const runState = startNewRun();

        // Prepare messages for agent (include conversation history)
        const conversationMessages = [...messages, userMessage];

        try {
            await agentService.current.runAgent(
                conversationMessages,
                allTools,
                agentSubscriber,
                runState
            );
        } catch (error) {
            console.error('Agent execution failed:', error);
            setIsStreaming(false);

            const errorMessage: Message = {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.'
            };
            setMessages(prev => [...prev, errorMessage]);
            endRun();
            throw error;
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        handleSendMessage(suggestion);
        inputRef.current?.focus();
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const showSuggestions = messages.length === 0 && !isStreaming;

    return (
        <div className="chat-interface">
            <ChatMessages
                messages={messages}
                isTyping={isStreaming}
                currentMessage={currentMessage}
                messagesEndRef={messagesEndRef}
            />

            <ArtifactRenderer artifacts={artifacts} />

            <div className="suggestions-container">
                {showSuggestions && (
                    <ChatSuggestions onSuggestionClick={handleSuggestionClick} />
                )}
            </div>

            <div className="input-container">
                <TextField
                    inputRef={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyUp={handleKeyPress}
                    placeholder="Ask me anything about training!"
                    variant="outlined"
                    fullWidth
                    className="input-field"
                    disabled={isStreaming}
                />
                <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isStreaming}
                    variant="contained"
                    color="primary"
                    className="send-button"
                >
                    <Send />
                </Button>
            </div>
        </div>
    );
};