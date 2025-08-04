import React from 'react';
import { Typography, CircularProgress } from '@mui/material';
import { Bot, User } from 'lucide-react';
import './ChatInterface.css';
import './ChatMessages.css';
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message as CoreMessage } from '@ag-ui/core';
import { InlineWidget } from 'react-calendly';

// Extend Message type for Calendly support
type CalendlyMessage = CoreMessage & {
    type: 'calendly';
    url: string;
    height?: number;
};
type Message = CoreMessage | CalendlyMessage;

function isCalendlyMessage(message: Message): message is CalendlyMessage {
    return (message as CalendlyMessage).type === 'calendly' && !!(message as CalendlyMessage).url;
}

interface ChatMessagesProps {
    messages: Message[];
    isTyping: boolean;
    currentMessage: string;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function ChatMessages({ messages, isTyping, currentMessage, messagesEndRef }: ChatMessagesProps) {
    return <>
        {
            messages.map((message, i) => {
                if (isCalendlyMessage(message)) {
                    return (
                        <div key={message.id || i} className={`message ${message.role} calendly-message`}>
                            <div className="bot-icon">
                                <img src="gabe-bot.png" alt="Bot Icon" className="bot-icon" />
                            </div>
                            {/* Render message content above widget if present */}
                            {message.content && (
                                <div className={`message-content ${message.role}`} style={{ width: '100%' }}>
                                    <Typography variant="body2" component="div">
                                        <Markdown remarkPlugins={[remarkGfm]}>
                                            {message.content}
                                        </Markdown>
                                    </Typography>
                                </div>
                            )}
                            <div className={`message-content ${message.role}`} style={{ width: '100%', padding: 0 }}>
                                <InlineWidget url={message.url} styles={{ height: message.height || 600, width: '100%' }} />
                            </div>
                        </div>
                    );
                }
                // Default message rendering
                return (
                    <div key={message.id || i} className={`message ${message.role}`}>
                        {message.role === 'assistant' && (
                            <div className="bot-icon">                            
                                <img src="gabe-bot.png" alt="Bot Icon" className="bot-icon" />
                            </div>
                        )}
                        <div className={`message-content ${message.role}`}>
                            <Typography variant="body2" component="div">
                                {message.content && (
                                    <Markdown remarkPlugins={[remarkGfm]}>
                                        {message.content}
                                    </Markdown>
                                )}
                            </Typography>
                        </div>
                        {message.role === 'user' && (
                            <div className="user-icon">
                                <User className="icon" />
                            </div>
                        )}
                    </div>
                );
            })
        }
        {
            isTyping && (
                <div className="message assistant">
                    <div className="bot-icon">                            
                        <img src="gabe-bot.png" alt="Bot Icon" className="bot-icon" />
                    </div>
                    <div className="message-content assistant">
                        <Typography variant="body2" component="div">
                            {currentMessage ? (
                                <Markdown remarkPlugins={[remarkGfm]}>
                                    {currentMessage}
                                </Markdown>
                            ) : (
                                <div className="typing-indicator">
                                    <CircularProgress size={24} />
                                </div>
                            )}
                        </Typography>
                    </div>
                </div>
            )
        }
        <div ref={messagesEndRef} />
    </>
}