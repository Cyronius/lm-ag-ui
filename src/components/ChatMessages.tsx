import React from 'react';
import { Typography, CircularProgress } from '@mui/material';
import { Bot, User, Wrench, Settings, Code } from 'lucide-react';
import './ChatInterface.css';
import './ChatMessages.css';
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '@ag-ui/core';
import { useAgentContext } from '../contexts/AgentClientContext';

interface ChatMessagesProps {
    messages: Message[];
    isTyping: boolean;
    currentMessage: string;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    getToolNameFromCallId: (toolCallId: string) => string | undefined;
}

function renderMessage(message: Message, tools: Map<string, any>, globalState: any, getToolNameFromCallId: (toolCallId: string) => string | undefined, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) {
    switch (message.role) {
        case 'user':
            return (
                <div className="message-content user">
                    <Typography variant="body2" component="div">
                        <Markdown remarkPlugins={[remarkGfm]}>
                            {message.content || ''}
                        </Markdown>
                    </Typography>
                </div>
            );
            
        case 'assistant':
            return (
                <div className="message-content assistant">
                    <Typography variant="body2" component="div">
                        <Markdown remarkPlugins={[remarkGfm]}>
                            {message.content || ''}
                        </Markdown>
                    </Typography>
                </div>
            );
            
        case 'tool':
            return renderToolMessage(message, tools, globalState, getToolNameFromCallId, updateState, getState);
            
        case 'system':
            return (
                <div className="message-content system">
                    <Typography variant="caption" component="div" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                        System: {message.content}
                    </Typography>
                </div>
            );
            
        case 'developer':
            return (
                <div className="message-content developer">
                    <Typography variant="caption" component="div" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                        Dev: {message.content}
                    </Typography>
                </div>
            );
            
        default:
            return (
                <div className="message-content">
                    <Typography variant="body2" component="div">
                        {message.content || ''}
                    </Typography>
                </div>
            );
    }
}

function renderToolMessage(message: Message, tools: Map<string, any>, globalState: any, getToolNameFromCallId: (toolCallId: string) => string | undefined, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) {
    // Get the tool name from the toolCallId mapping
    let toolName = '';
    
    if (message.toolCallId) {
        toolName = getToolNameFromCallId(message.toolCallId) || '';
    }
    
    return (
        <div className="message-content tool">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Wrench size={16} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Tool: {toolName || 'Unknown'}
                </Typography>
            </div>
            <Typography variant="body2" component="div">
                <Markdown remarkPlugins={[remarkGfm]}>
                    {message.content || ''}
                </Markdown>
            </Typography>
            {/* Render tool-specific UI by invoking the tool's renderer */}
            {toolName && (() => {
                const tool = tools.get(toolName);
                if (tool && tool.renderer) {
                    // Parse args from message content if needed
                    let args = {};
                    try {
                        // You might need to extract args differently based on your message format
                        args = JSON.parse(message.content || '{}');
                    } catch {
                        // If content isn't JSON, use it as is
                        args = { content: message.content };
                    }
                    
                    // Call the tool's renderer with state management functions
                    const renderResult = tool.renderer(args, message.content || '', updateState, getState);
                    
                    // If the renderer returns JSX, render it
                    if (React.isValidElement(renderResult)) {
                        return <div style={{ marginTop: '8px' }}>{renderResult}</div>;
                    }
                    
                    // Otherwise, the renderer might have manipulated state or DOM directly
                    // Check if there's state data to render
                    if (globalState[toolName]) {
                        return (
                            <div style={{ marginTop: '8px' }}>
                                <pre>{JSON.stringify(globalState[toolName], null, 2)}</pre>
                            </div>
                        );
                    }
                }
                return null;
            })()}
        </div>
    );
}

function getMessageIcon(role: string) {
    switch (role) {
        case 'assistant':
            return <img src="gabe-bot.png" alt="Bot Icon" className="bot-icon" />;
        case 'user':
            return <User className="icon" />;
        case 'tool':
            return <Wrench className="icon" />;
        case 'system':
            return <Settings className="icon" />;
        case 'developer':
            return <Code className="icon" />;
        default:
            return null;
    }
}

export default function ChatMessages({ messages, isTyping, currentMessage, messagesEndRef, getToolNameFromCallId }: ChatMessagesProps) {
    const { tools, globalState, updateState, getState } = useAgentContext();
    
    return <>
        {
            messages.map((message, i) => (
                <div key={message.id || i} className={`message ${message.role}`}>
                    {(message.role === 'assistant' || message.role === 'tool' || message.role === 'system' || message.role === 'developer') && (
                        <div className="bot-icon">
                            {getMessageIcon(message.role)}
                        </div>
                    )}
                    {renderMessage(message, tools, globalState, getToolNameFromCallId, updateState, getState)}
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