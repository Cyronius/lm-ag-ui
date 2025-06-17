import React from 'react';
import { Typography, CircularProgress } from '@mui/material';
import { Bot, User } from 'lucide-react';
import './ChatInterface.css';
import './ChatMessages.css';
import { Message } from '../types';


interface ChatMessagesProps {
    messages: Message[];
    isTyping: boolean;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function ChatMessages({ messages, isTyping, messagesEndRef }: ChatMessagesProps) {
    return <>
        {
            messages.map((message) => (
                <div key={message.id} className={`message ${message.sender}`}>
                    {message.sender === 'bot' && (
                        <div className="bot-icon">
                            <Bot className="icon" />
                        </div>
                    )}
                    <div className={`message-content ${message.sender}`}>
                        <Typography variant="body2">
                            {message.content}
                        </Typography>
                        <Typography variant="caption" className="message-timestamp">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                    </div>
                    {message.sender === 'user' && (
                        <div className="user-icon">
                            <User className="icon" />
                        </div>
                    )}
                </div>
            ))
        }
        {
            isTyping && (
                <div className="typing-indicator">
                    <CircularProgress size={24} />
                </div>
            )
        }
        <div ref={messagesEndRef} />
    </>
}
