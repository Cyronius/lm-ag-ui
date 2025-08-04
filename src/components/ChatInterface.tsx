import React, { useState, useRef, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import { Send } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import ChatMessages from './ChatMessages';
import './ChatInterface.css';
import { Message } from '@ag-ui/core';
import { useAgentContext } from '../contexts/AgentClientContext';
import { useAgent } from '../hooks/useAgent';
import { getAllToolDefinitions } from '../tools/unifiedTools';

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Use the unified context
    const { agentClient, session, tools } = useAgentContext();
    const allTools = getAllToolDefinitions(tools);
    // Use the new combined hook for Agent and Tool Subscribers
    const {
        agentSubscriber,
        currentMessage: agentCurrentMessage,
        getToolNameFromCallId
    } = useAgent({
        onMessageComplete: (completedMessage) => setMessages(prev => [...prev, completedMessage]),
        onErrorMessage: (errorMessage) => setMessages(prev => [...prev, errorMessage]),
        agentClient: agentClient
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, agentCurrentMessage]);

    const handleSendMessage = async (messageText?: string) => {
        const textToSend = messageText || inputValue;
        if (!textToSend.trim() || session.isActive) return;

        // Add user message
        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: textToSend
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');

        // Start new run
        const runState = agentClient.startNewRun();

        // Prepare messages for agent (include conversation history)
        const conversationMessages = [...messages, userMessage];

        try {
            await agentClient.runAgent(
                conversationMessages,
                allTools,
                agentSubscriber
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

    const showSuggestions = messages.length === 0 && !session.isActive;

    return (
        <div className="chat-interface">
            <ChatMessages
                messages={messages}
                isTyping={session.isActive}
                currentMessage={agentCurrentMessage}
                messagesEndRef={messagesEndRef}
                getToolNameFromCallId={getToolNameFromCallId}
            />

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
                    disabled={session.isActive}
                />
                <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || session.isActive}
                    variant="contained"
                    color="primary"
                    className="send-button"
                >
                    <Send />
                </Button>
            </div>

            
            <div className="suggestions-container">
                {showSuggestions && (
                    <ChatSuggestions onSuggestionClick={handleSuggestionClick} />
                )}
            </div>
        </div>
    );
};