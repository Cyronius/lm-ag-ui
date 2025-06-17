import React, { useState, useRef, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import { Send } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import ChatMessages from './ChatMessages';
import './ChatInterface.css';
import { Message } from '../types';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';

interface ChatInterfaceProps {
    onBack?: () => void;
}

const ChatInterface = ({ onBack }: ChatInterfaceProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
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

        // Simulate bot response
        setTimeout(() => {
            const botResponse = generateBotResponse(textToSend);
            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: botResponse,
                sender: 'bot',
                timestamp: new Date()
            };

            setMessages(prev => [...prev, botMessage]);
            setIsTyping(false);
        }, 1000 + Math.random() * 1000);
    };

    const generateBotResponse = (userInput: string): string => {
        const input = userInput.toLowerCase();

        if (input.includes('demo') || input.includes('schedule')) {
            return "Perfect! I'll help you schedule a demo of our LMS platform. To get started, I'll need a few details:\n\n• Your name and email address\n• Your preferred time (morning, afternoon, or evening)\n• Any specific features you're most interested in seeing\n\nWhat's your name and email address?";
        }

        if (input.includes('content') || input.includes('create') || input.includes('ai assistance')) {
            return "Excellent! I can help you create engaging training content with AI. Let's start by understanding what you need:\n\n• What type of content? (compliance training, onboarding, skills assessment, microlearning)\n• What's the topic or subject area?\n• How long should the content be?\n• Who is your target audience?\n\nWhat type of training content would you like to create?";
        }

        if (input.includes('microlearning')) {
            return "Microlearning is a fantastic approach! Here are the key best practices:\n\n✅ **Keep it short**: 5-10 minutes max per module\n✅ **Single focus**: One learning objective per module\n✅ **Interactive elements**: Quizzes, scenarios, or simulations\n✅ **Mobile-friendly**: Accessible on any device\n✅ **Just-in-time**: Available when learners need it\n\nWould you like me to help you create a microlearning module on a specific topic?";
        }

        if (input.includes('compliance')) {
            return "Compliance training is crucial! Here's what makes it effective:\n\n🎯 **Regular updates** to reflect regulatory changes\n📊 **Progress tracking** and completion certificates\n🎭 **Real scenarios** and case studies\n📱 **Mobile accessibility** for field workers\n📈 **Analytics** to monitor completion rates\n\nWhat type of compliance training do you need help with? (safety, data protection, harassment prevention, etc.)";
        }

        if (input.includes('lms') || input.includes('features') || input.includes('platform')) {
            return "Our LMS platform includes powerful features designed for modern learning:\n\n🤖 **AI Content Creation** - Generate courses automatically\n📊 **Advanced Analytics** - Track learner progress and engagement\n📱 **Mobile Learning** - Learn anywhere, anytime\n🔗 **Integrations** - Connect with your existing tools\n⚡ **Microlearning** - Bite-sized, effective content\n🏆 **Gamification** - Badges, leaderboards, achievements\n\nWhich features are most important for your organization?";
        }

        if (input.includes('account') || input.includes('sign up') || input.includes('setup')) {
            return "I'd be happy to guide you through setting up your account! The process includes:\n\n1️⃣ **Choose your plan** (we have options for every organization size)\n2️⃣ **Organization setup** (company details, branding)\n3️⃣ **User management** (roles, permissions, team structure)\n4️⃣ **Content migration** (import existing training materials)\n5️⃣ **Integration setup** (connect your tools)\n\nWhat's your organization size, and what's your primary use case for the LMS?";
        }

        if (input.includes('training') && input.includes('question')) {
            return "I'm here to help with any training questions! I can assist with:\n\n📚 **Instructional Design** - Adult learning principles, engagement strategies\n🎯 **Training Strategy** - Needs analysis, learning paths, blended learning\n📊 **Assessment** - Quiz design, competency evaluation, progress tracking\n🔄 **Implementation** - Change management, rollout strategies\n\nWhat specific training challenge are you facing?";
        }

        const responses = [
            "I'd love to help you with that! Could you tell me a bit more about what you're looking for? I can assist with training questions, content creation, demo scheduling, or account setup.",
            "That's interesting! To give you the most helpful response, could you provide a few more details about your specific needs or goals?",
            "I'm here to help! Whether you need training advice, want to create content, schedule a demo, or get account support - just let me know what you'd like to focus on.",
        ];

        return responses[Math.floor(Math.random() * responses.length)];
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
