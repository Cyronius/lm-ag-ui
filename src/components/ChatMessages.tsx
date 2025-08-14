import React from 'react';
import { Typography, CircularProgress } from '@mui/material';
import { User, Wrench, Settings, Code } from 'lucide-react';
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

function renderMessage(message: Message, tools: Record<string, any>, globalState: any, getToolNameFromCallId: (toolCallId: string) => string | undefined, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) {
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

    }
}

function renderToolMessage(message: Message, tools: Record<string, any>, globalState: any, getToolNameFromCallId: (toolCallId: string) => string | undefined, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) {
    // Get the tool name from the toolCallId mapping
    let toolName = '';
    const toolCallId = (message.role === 'tool' && 'toolCallId' in message) ? (message as any).toolCallId : undefined;
    if (toolCallId) {
        toolName = getToolNameFromCallId(toolCallId) || '';
    }

    if (!toolName) {
        console.error(`couldn't find tool with id ${toolCallId}, so skipping rendering`);
        return;
    }

    const tool = tools[toolName];
    // it is possible a tool is defined on the backend but not the frontend -- this is true for knowledge bases
    if (!tool) {        
        return
    }

    // if this tool has no renderer -- no need to do anything
    if (!tool.renderer) {
        return
    }

    
    // Parse args from message content, handling one level of result property
    let args: any = {};    
    try {
        args = JSON.parse(message.content || '{}');
        if (args.result !== undefined) {
            // Try to parse result as JSON, otherwise use as is
            try {
                args = JSON.parse(args.result);
            } catch {
                args = args.result;
            }
        }
    } catch {
        // If content isn't JSON, use it as is. Probably just some text.
        args = message.content;
    }
    
    // Call the tool's renderer with state management functions
    const renderResult = tool.renderer(args, message.content || '', updateState, getState);
    
    // If the renderer returns JSX, render it
    if (!React.isValidElement(renderResult)) {
        return
    }
                
    return (
        <div className="message-content tool">
            {renderResult}            
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
            return null;
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
            
            messages.map((message, i) => {
                
                let results = renderMessage(message, tools, globalState, getToolNameFromCallId, updateState, getState)
                if (!results) {
                    return null
                }
                
                return <div key={message.id || i} className={`message ${message.role}`}>                    
                    {(message.role === 'assistant' || message.role === 'system' || message.role === 'developer') && (
                        <div className="bot-icon">
                            {getMessageIcon(message.role)}
                        </div>
                    )}
                    {results}
                    {message.role === 'user' && (
                        <div className="user-icon">
                            <User className="icon" />
                        </div>
                    )}
                </div>

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