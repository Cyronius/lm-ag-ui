import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, Button, IconButton, Chip } from '@mui/material';
import { Add } from '@mui/icons-material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import LabelIcon from '@mui/icons-material/Label';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ChatMessages from './ChatMessages';
import ChatSuggestions from './ChatSuggestions';
import { useThemeMode } from '../contexts/ThemeContext';
import './ChatInterface.css';
import { Message } from '@ag-ui/core';
import { useAgentContext } from '../contexts/AgentClientContext';
import { useAgent } from '../hooks/useAgent';
import { getAllToolDefinitions } from '../tools/toolUtils';

// callback prop to lift dynamic content meta
type ChatInterfaceProps = {
    onDynamicMetaChange?: (meta: { showDynamicContent: boolean; lastQuestion?: string }) => void;
};

export default function ChatInterface({ onDynamicMetaChange }: ChatInterfaceProps) {
    const { mode } = useThemeMode();
    const [lastSuggestionClicked, setLastSuggestionClicked] = useState<string>();
    // Listen for calendly chat message events from the frontend tool
    useEffect(() => {
        const handleCalendlyChatMessage = (e: CustomEvent) => {
            const calendlyMsg = e.detail;
            setMessages(prev => [...prev, calendlyMsg]);
        };
        window.addEventListener('addCalendlyChatMessage', handleCalendlyChatMessage as EventListener);
        return () => {
            window.removeEventListener('addCalendlyChatMessage', handleCalendlyChatMessage as EventListener);
        };
    }, []);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);
    const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Use the unified context
    const { agentClient, session, tools } = useAgentContext();
    const allTools = getAllToolDefinitions(tools);
    // Use the new combined hook for Agent and Tool Subscribers
    const {
        agentSubscriber,
        currentMessage: agentCurrentMessage,
        getToolNameFromCallId
    } = useAgent({
        onMessageComplete: (completedMessage) => {
            setMessages(prev => {
                let prevMessages = [...prev];
                let toAppend = prevMessages.find(pm => pm.id === completedMessage.id);

                // When scheduling a demo, the followup response is returned in multiple chunks with the same id and React complains about duplicate keys.
                // Group these chunks together to form one single response.
                if (toAppend && toAppend.content) {
                    toAppend.content += completedMessage.content;
                    return prevMessages;
                }

                return [...prev, completedMessage]
            }
            );
        },
        onErrorMessage: (errorMessage) => setMessages(prev => [...prev, errorMessage]),
        agentClient: agentClient
    });

    // Restore focus when agent session ends
    useEffect(() => {
        if (!session.isActive && inputRef.current && messages.length > 0) {
            const timer = setTimeout(() => {
                requestAnimationFrame(() => {
                    if (inputRef.current && !inputRef.current.disabled) {
                        inputRef.current.focus();
                    }
                });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [session.isActive, messages.length]);

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            const container = messagesEndRef.current.parentElement;
            if (container && container.classList.contains('chat-messages-container')) {
                container.scrollTop = container.scrollHeight;
            } else {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, agentCurrentMessage]);

    const handleSendMessage = async (messageText?: string) => {
        const textToSend = messageText || inputValue;
        const cleanedSuggestions = selectedSuggestions.map(s =>
            s.endsWith('...') ? s.slice(0, -3).trim() : s
        );
        const chipsPrefix = cleanedSuggestions.length
            ? `${cleanedSuggestions.join(' ')} `
            : '';
        const fullContent = (chipsPrefix + textToSend).trim();
        if (!fullContent || session.isActive) return;

        // Add user message
        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: fullContent
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setAttachments([]);
        setSelectedSuggestions([]);

        // Start new run
        const runState = agentClient.startNewRun();

        // Prepare messages for agent (include conversation history)
        // Filter out Calendly messages before sending to backend
        const isCalendlyMessage = (msg: any) => msg.type === 'calendly' && !!msg.url;
        const conversationMessages = [...messages, userMessage].filter(msg => !isCalendlyMessage(msg));

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
        setLastSuggestionClicked(suggestion);
        setSelectedSuggestions([suggestion]);
        inputRef.current?.focus();
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const openFilePicker = () => fileInputRef.current?.click();
    const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length) setAttachments(prev => [...prev, ...files]);
        // allow selecting same file again
        if (e.target) e.target.value = '';
    };

    // Lift visibility and label info to parent
    useEffect(() => {
        const showDynamicContent = messages.length === 0 && !session.isActive;
        onDynamicMetaChange?.({
            showDynamicContent,
            lastQuestion: inputValue || lastSuggestionClicked || selectedSuggestions[selectedSuggestions.length - 1]
        });
    }, [messages, session.isActive, inputValue, lastSuggestionClicked, selectedSuggestions, onDynamicMetaChange]);

    // Hide header when chat is open (has messages or typing)
    useEffect(() => {
        const isChatOpen = messages.length > 0 || session.isActive;
        const el = document.documentElement;
        if (isChatOpen) {
            el.setAttribute('data-chat-open', 'true');
        } else {
            el.removeAttribute('data-chat-open');
        }
        return () => el.removeAttribute('data-chat-open');
    }, [messages.length, session.isActive]);

    const showSuggestions = messages.length === 0 && !session.isActive;
    // const showDynamicContent = messages.length === 0 && !session.isActive; // moved up

    return (
        <Box className="chat-interface">
            {messages.length > 0 && (
                <div className="chat-messages-container">
                    <ChatMessages
                        messages={messages}
                        isTyping={session.isActive}
                        currentMessage={agentCurrentMessage}
                        messagesEndRef={messagesEndRef}
                        getToolNameFromCallId={getToolNameFromCallId}
                    />
                </div>
            )}

            <div className="input-container">
                <IconButton
                    className="attach-button"
                    aria-label="attach files"
                    onClick={openFilePicker}
                    disabled={true} // temporarily disabled
                    size="large"
                >
                    <Add />
                </IconButton>

                {selectedSuggestions.map(s => (
                    <Chip
                        key={s}
                        label={s}
                        size="medium"
                        className="selected-chip"
                        icon={<LabelIcon className="chip-leading-icon" />}
                        deleteIcon={<CancelOutlinedIcon className="chip-delete-icon" />}
                        onDelete={() =>
                            setSelectedSuggestions(prev => prev.filter(x => x !== s))
                        }
                    />
                ))}

                <TextField
                    inputRef={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => handleKeyPress(e as React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>)}
                    placeholder={
                        selectedSuggestions.length
                            ? 'Add any additional details you want to ask...'
                            : 'Ask questions, create content, schedule demos, or get account help - all through natural conversation...'
                    }
                    variant="outlined"
                    fullWidth
                    className="input-field"
                    disabled={session.isActive}
                    multiline
                    minRows={1}
                    maxRows={6}
                />
                <Button
                    onClick={() => handleSendMessage()}
                    disabled={(!inputValue.trim() && selectedSuggestions.length === 0) || session.isActive}
                    variant="contained"
                    color="primary"
                    className="send-button"
                >
                    <ArrowUpwardIcon />
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={handleFilesSelected}
                />
            </div>


            {attachments.length > 0 && (
                <div style={{ alignSelf: 'flex-start', marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                    {attachments.length} file(s) selected
                </div>
            )}

            {showSuggestions && (
                <Box className="suggestions-container">
                    <ChatSuggestions onSuggestionClick={handleSuggestionClick} />
                </Box>
            )}
        </Box>
    );
}