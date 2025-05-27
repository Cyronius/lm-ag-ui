import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Bot, User } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

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
    
    // Default responses for unclear input
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
    <div className="h-[600px] flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.sender === 'bot' && (
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-blue-600" />
              </div>
            )}
            
            <div className={`max-w-[80%] rounded-2xl p-4 ${
              message.sender === 'user' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              <p className="text-sm whitespace-pre-line">{message.content}</p>
              <span className="text-xs opacity-70 mt-2 block">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            {message.sender === 'user' && (
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        
        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="bg-gray-100 rounded-2xl p-4">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6">
        {showSuggestions && (
          <ChatSuggestions onSuggestionClick={handleSuggestionClick} />
        )}
        
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about training, content creation, or schedule a demo..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isTyping}
            className="bg-blue-600 hover:bg-blue-700 rounded-full px-6"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
