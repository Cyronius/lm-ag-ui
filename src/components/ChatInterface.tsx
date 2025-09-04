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
import { getAllToolDefinitions } from '../tools/toolUtils';

// callback prop to lift dynamic content meta
type ChatInterfaceProps = {
    onDynamicMetaChange?: (meta: { showDynamicContent: boolean; lastQuestion?: string }) => void;
};

export default function ChatInterface({ onDynamicMetaChange }: ChatInterfaceProps) {
    const { mode } = useThemeMode();
    const [lastSuggestionClicked, setLastSuggestionClicked] = useState<string>();    
    const [inputValue, setInputValue] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);
    const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Use the unified context
    const { 
        agentClient, 
        session, 
        tools, 
        messages, 
        addMessage,
        agentSubscriber,
    } = useAgentContext();
    const allTools = getAllToolDefinitions(tools);

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
        addMessage(userMessage);
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
    const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;


        setAttachments(prev => [...prev, ...files]);
        
        
        
         // Upload selected files to /fileupload        
        try {

            // ensure we have a thread id
            let session = agentClient.startNewRun()
            let threadId = session.threadId
            
            const formData = new FormData();
            // Append all files under the same "files" field; most backends accept this as an array
            files.forEach((file) => formData.append('files', file));
            formData.append('thread_id', threadId! )
            const response = await fetch(`${import.meta.env.VITE_PYTHON_SERVER_URL}/smarketing/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`Upload failed (${response.status}): ${text}`);
            }

            // Try to parse JSON response if provided
            let data: any = null;
            try {
                data = await response.json();
            } catch {
                // non-JSON response is fine
            }
            console.log('Files uploaded successfully', data ?? '(no response body)');
        } catch (err) {
            console.error('Error uploading files:', err);
        }
    };
    

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

    return (
        <Box className="chat-interface">
            {messages.length > 0 && (                
                <ChatMessages />                                
            )}

            <div className="input-container">
                <div className="text">

                    {attachments.map((file) =>
                        // TODO: put a preview here
                        <div key={file.name} style={{ aspectRatio: 1, maxWidth: '100px', overflow: 'hidden' }}>
                            {file.name}
                        </div>
                    )}

                    
                    {selectedSuggestions.map((s) => (
                        <Chip
                            key={s}
                            label={s}
                            size="medium"
                            className="selected-chip"
                            icon={<LabelIcon className="chip-leading-icon" />}
                            deleteIcon={
                                <CancelOutlinedIcon className="chip-delete-icon" />
                            }
                            onDelete={() =>
                                setSelectedSuggestions((prev) =>
                                    prev.filter((x) => x !== s)
                                )
                            }
                        />
                    ))}

                    <TextField
                        inputRef={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) =>
                            handleKeyPress(
                                e as React.KeyboardEvent<
                                    HTMLInputElement | HTMLTextAreaElement
                                >
                            )
                        }
                        placeholder={
                            selectedSuggestions.length
                                ? "Add any additional details you want to ask..."
                                : "Ask questions, create content, schedule demos, or get account help - all through natural conversation..."
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
                        disabled={
                            (!inputValue.trim() &&
                                selectedSuggestions.length === 0) ||
                            session.isActive
                        }
                        variant="contained"
                        color="primary"
                        className="send-button"
                        aria-label="send button"
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
                <IconButton
                    className="attach-button"
                    aria-label="attach files"
                    onClick={openFilePicker}                    
                    size="large"
                    disabled
                >
                    <Add />
                </IconButton>
            </div>

            {/* {attachments.length > 0 && (
                <div
                    style={{
                        alignSelf: "flex-start",
                        marginTop: 8,
                        fontSize: 12,
                        opacity: 0.75,
                    }}
                >
                    {attachments.length} file(s) selected
                </div>
            )} */}

            {showSuggestions && (
                <Box className="suggestions-container">
                    <ChatSuggestions
                        onSuggestionClick={handleSuggestionClick}
                    />
                </Box>
            )}
        </Box>
    );
}