import React, { useState, useRef, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import { Send } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import ChatMessages from './ChatMessages';
import { ArtifactRenderer } from './artifacts';
import './ChatInterface.css';
import { Message } from '@ag-ui/core';
import { ArtifactData, AgentSubscriber } from '../types/index';
import { useAgentClient } from '../contexts/AgentClientContext';
import { useAgent } from '../hooks/useAgent';
import { createUnifiedTools, getAllToolDefinitions } from '../tools/unifiedTools';

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [artifacts, setArtifacts] = useState<Map<string, ArtifactData>>(new Map());

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Use the unified AgentClient
    const agentClient = useAgentClient();
    
    // Create unified tools for this component
    const unifiedTools = createUnifiedTools({ setArtifacts });
    const allTools = getAllToolDefinitions(unifiedTools);
    // Use the new combined hook for Agent and Tool Subscribers
    const {
        agentSubscriber,
        isStreaming: agentIsStreaming,
        currentMessage: agentCurrentMessage
    } = useAgent({
        onMessageComplete: (completedMessage) => setMessages(prev => [...prev, completedMessage]),
        onErrorMessage: (errorMessage) => setMessages(prev => [...prev, errorMessage]),
        setArtifacts,
        endRun: () => agentClient.endRun(),
        agentService: agentClient,
        sessionState: agentClient.session
    });

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

    useEffect(() => {
        scrollToBottom();
    }, [messages, agentCurrentMessage]);

  return (
    <div className="chat-interface">
      <ChatMessages
        messages={messages}
        isTyping={agentIsStreaming}
        currentMessage={agentCurrentMessage}
        messagesEndRef={messagesEndRef}
      />
      <ArtifactRenderer artifacts={artifacts} />

      <div className="input-container">
        <TextField
          inputRef={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyUp={handleKeyPress}
          placeholder="Ask me anything about training!"
          variant="outlined"
          fullWidth
          disabled={agentIsStreaming}
        />
        <Button
          onClick={() => handleSendMessage()}
          disabled={!inputValue.trim() || agentIsStreaming}
          variant="contained"
        >
          <Send />
        </Button>
      </div>

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

            
            <div className="suggestions-container">
                {showSuggestions && (
                    <ChatSuggestions onSuggestionClick={handleSuggestionClick} />
                )}
            </div>
        </div>
    );
};
