import React, { useState, useRef, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import { Send } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import ChatMessages from './ChatMessages';
import './ChatInterface.css';
import { Message } from '../types';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';
import { CHAT_SERVER_URL } from '../settings';

interface ChatInterfaceProps {
    onBack?: () => void;
}

const ChatInterface = ({ onBack }: ChatInterfaceProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async (messageText?: string) => {
        const textToSend = messageText || inputValue;
        if (!textToSend.trim()) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            content: textToSend,
            sender: 'user',
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsTyping(true);

        try {
            const response = await fetch(`${CHAT_SERVER_URL}/smarketing_chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: textToSend,
                    session_id: sessionId,
                }),
            });
            const data = await response.json();
            if (data.session_id) {
                setSessionId(data.session_id);
            }
            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: data.response || 'No response from server.',
                sender: 'bot',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, botMessage]);
        } catch (err) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 2).toString(),
                content: 'Error connecting to chat server.',
                sender: 'bot',
                timestamp: new Date()
            }]);
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

    const showSuggestions = messages.length === 0;

    return (
        <ThemeProvider theme={theme}>
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
        </ThemeProvider>
    );
};

export default ChatInterface;
