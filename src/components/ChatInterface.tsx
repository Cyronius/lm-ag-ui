import React, { useState, useRef, useEffect } from 'react';
import { CopilotKit, useCopilotChat } from "@copilotkit/react-core";
import { Role, TextMessage } from "@copilotkit/runtime-client-gql";
import { Button, TextField } from '@mui/material';
import { Send } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import ChatMessages from './ChatMessages';
import './ChatInterface.css';
import { CHAT_SERVER_URL } from '../settings';
import { ChatEvent, Content } from '../types';

export default function ChatInterfaceWrapped() {
    return (
        <CopilotKit runtimeUrl={`${CHAT_SERVER_URL}/run_sse`} >
            <ChatInterface/>
        </CopilotKit>
    )
}

function ChatInterface() {
    const {
        visibleMessages,    // An array of messages that are currently visible in the chat.
        appendMessage,      // A function to append a message to the chat.
        setMessages,        // A function to set the messages in the chat.
        deleteMessage,      // A function to delete a message from the chat.
        reloadMessages,     // A function to reload the messages from the API.
        stopGeneration,     // A function to stop the generation of the next message.
        reset,              // A function to reset the chat.
        isLoading,          // A boolean indicating if the chat is loading.
    } = useCopilotChat();

    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [session, setSession] = useState<object | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [visibleMessages]);

    

    const handleSendMessage = async (messageText: string) => {
        appendMessage(
            new TextMessage({
                content: messageText,
                role: Role.User,
            })
        )
    };

    const handleSuggestionClick = (suggestion: string) => {
        handleSendMessage(suggestion);
        inputRef.current?.focus();
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(inputValue);
        }
    };

    // TODO: future: this should condition on having a session ID
    //const showSuggestions = messages.length === 0;
    const showSuggestions = true

    return (
        
        <div className="chat-interface">
            <ChatMessages messagesEndRef={messagesEndRef}  />

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
                />
                <Button
                    onClick={() => handleSendMessage(inputValue)}
                    disabled={!inputValue.trim() || isTyping}
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

// Helper function to create a message object for the given text and optional role
function message(content: string, role='bot'): Content {    
    return {
        parts: [{ text: content }],
        role: 'bot',
    };
}

function getBotResponseMessages(data: Array<ChatEvent>): Content[] {
    const filteredContent: Content[] = [];
    for (const event of data) {
        if (event.content && event.content.role === 'model' && event.content.parts) {
            for (const part of event.content.parts) {
                // TODO:
                // ignore part.functionCall and part.functionResponse
                // in fact, right now text parts are all I care about                
                if (part.text) {
                    filteredContent.push(message(part.text));                    
                }
            }
        }
    }

    // if no text, let's just dump what the model did. Maybe it was a function call or something else.
    if (filteredContent.length === 0) {
        // Output one line for each part in all model events
        let lines: string[] = [];
        for (const event of data) {
            // TODO: adk bug incorrectly marks function calls as role='user' !
            // https://github.com/google/adk-python/issues/1748
            if (event.content && /*event.content.role === 'model' &&*/ event.content.parts) {
                for (const part of event.content.parts) {
                    const obj = JSON.stringify(part, null, 4);
                    lines.push(obj)
                }
            }
        }
        if (lines.length === 0) {
            lines.push("I received a response from the server, but it wasn't textual.");
        }
        for (const line of lines) {
            filteredContent.push(message(line));
        }
    }
    return filteredContent;
}

