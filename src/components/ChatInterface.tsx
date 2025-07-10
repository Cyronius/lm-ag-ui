import React, { useState, useRef, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import { Send } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import ChatMessages from './ChatMessages';
import './ChatInterface.css';
import { CHAT_SERVER_URL } from '../settings';
import { ChatEvent, Content } from '../types';


interface ChatInterfaceProps {
    onBack?: () => void;
}

const ChatInterface = ({ onBack }: ChatInterfaceProps) => {
    const [messages, setMessages] = useState<Content[]>([]);
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
    }, [messages]);

    // Helper to create a new session
    const createNewSession = async () => {
        try {
            const response = await fetch(`${CHAT_SERVER_URL}/apps/smarketing/users/user/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();            
            const session = {
                sessionId: data.id,
                userId: data.userId,
                appName: data.appName,
            }
            setSession(session);
            return session;

        } catch (err) {
            setMessages(prev => [...prev, message('Error creating chat session.')]);
        }
        return null;
    };


    const handleSendMessage = async (messageText?: string) => {
        const textToSend = messageText || inputValue;
        if (!textToSend.trim()) return;

        const userMessage = message(textToSend, 'user');

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsTyping(true);

        // Ensure sessionId exists
        let currentSession = session;
        if (!currentSession) {
            currentSession = await createNewSession();
            if (!currentSession) {
                setIsTyping(false);
                return;
            }
        }

        try {
            // run_sse for streaming responses
            // /run_agui for ag-ui responses + streaming
            const response = await fetch(`${CHAT_SERVER_URL}/run`, {
            //const response = await fetch(`${CHAT_SERVER_URL}/run_agui`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ag_ui: true, // Enable ag-ui mode
                    new_message: {
                        role: 'user',
                        parts: [{
                            text: textToSend
                        }]
                    },
                    ...currentSession
                }),
            });
            const data = await response.json();
            // data is now an array of events
            // Find the last event with a model role and a text part
            let botResponses = getBotResponseMessages(data);            
            setMessages(prev => [...prev, ...botResponses]);
        } catch (err) {
            setMessages(prev => [...prev, message('Error connecting to chat server.')]);
        } finally {
            setIsTyping(false);
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

    // TODO: future: this should condition on having a session ID
    //const showSuggestions = messages.length === 0;
    const showSuggestions = true

    return (
        
        <div className="chat-interface">
            <ChatMessages messages={messages} isTyping={isTyping} messagesEndRef={messagesEndRef}  />

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
                />
                <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isTyping}
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

// Helper function to create a message object for the given text and optional role
function message(content: string, role='bot'): Content {    
    return {
        parts: [{ text: content }],
        role: 'bot',
    };
}

export default ChatInterface;
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

