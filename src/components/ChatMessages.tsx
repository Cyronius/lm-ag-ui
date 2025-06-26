import React from 'react';
import { Typography, CircularProgress } from '@mui/material';
import { Bot, User } from 'lucide-react';
import './ChatInterface.css';
import './ChatMessages.css';
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatEvent, Content } from '../types';

interface ChatMessagesProps {
    messages: Content[];
    isTyping: boolean;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function ChatMessages({ messages, isTyping, messagesEndRef }: ChatMessagesProps) {
    return <>
        {
            messages.map((message, i) => (
                <div key={i} className={`message ${message.role}`}>
                    {message.role === 'bot' && (
                        <div className="bot-icon">
                            <Bot className="icon" />
                        </div>
                    )}
                    <div className={`message-content ${message.role}`}>
                        {message.parts?.map((part,j) =>
                            <Typography key={j} variant="body2" component="div">
                                {/* Markdown expects a string or array of strings, not an array of objects or numbers */}
                                {part.text &&
                                    <Markdown remarkPlugins={[remarkGfm]}>
                                        {part.text}
                                    </Markdown>
                                }
                            </Typography>
                        )}                        
                    </div>
                    {message.role === 'user' && (
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
