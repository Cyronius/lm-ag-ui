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
import { useAgent } from '../hooks/useAgent';
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
    // Use the new combined hook for Agent and Tool Subscribers
    const {
        agentSubscriber,
        isStreaming: agentIsStreaming,
        currentMessage: agentCurrentMessage
    } = useAgent({
        onMessageComplete: (completedMessage) => setMessages(prev => [...prev, completedMessage]),
        onErrorMessage: (errorMessage) => setMessages(prev => [...prev, errorMessage]),
        setArtifacts,
        endRun
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, currentMessage]);

    // ...existing code...

    const handleSendMessage = async (messageText?: string) => {
        const textToSend = messageText || inputValue;
        if (!textToSend.trim() || agentIsStreaming) return;

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
            // Error handling is now managed by the hook
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

    const showSuggestions = messages.length === 0 && !agentIsStreaming;

    return (
        <div className="chat-interface">
            <ChatMessages
                messages={messages}
                isTyping={agentIsStreaming}
                currentMessage={agentCurrentMessage}
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
                    disabled={agentIsStreaming}
                />
                <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || agentIsStreaming}
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