
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface ChatInterfaceProps {
  onBack: () => void;
}

const ChatInterface = ({ onBack }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hello! I'm your Training Assistant. I can help you with questions about training best practices, LMS features, content creation, and more. What would you like to know?",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate bot response
    setTimeout(() => {
      const botResponse = generateBotResponse(inputValue);
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
      return "I'd be happy to help you schedule a demo! You can use the 'Schedule Demo' button to book a personalized demonstration of our LMS platform. Would you like me to guide you through the scheduling process?";
    }
    
    if (input.includes('content') || input.includes('create') || input.includes('module')) {
      return "Great! I can help you create training content using AI. Our content creation tool can generate compliance training, onboarding modules, skills assessments, and microlearning units. Would you like to start creating content now?";
    }
    
    if (input.includes('microlearning')) {
      return "Microlearning is a fantastic approach! It involves delivering content in small, focused chunks that learners can easily digest. Best practices include: keeping modules under 10 minutes, focusing on single learning objectives, using multimedia elements, and providing immediate feedback. Would you like help creating a microlearning module?";
    }
    
    if (input.includes('compliance')) {
      return "Compliance training is crucial for organizational success. Key elements include: regular updates to reflect regulatory changes, interactive scenarios, progress tracking, and completion certificates. Our LMS provides automated compliance tracking and reporting. Need help setting up compliance training?";
    }
    
    if (input.includes('lms') || input.includes('features')) {
      return "Our LMS includes powerful features like: AI-powered content creation, automated compliance tracking, interactive assessments, mobile learning support, detailed analytics, and integration capabilities. Which specific feature would you like to learn more about?";
    }
    
    if (input.includes('account') || input.includes('sign up')) {
      return "I can guide you through creating an account! The process includes: choosing your plan, setting up your organization profile, configuring user roles, and importing existing content. Would you like me to walk you through the account creation process?";
    }
    
    // Default responses
    const responses = [
      "That's a great question! I can provide more specific guidance if you could tell me more about your training needs or goals.",
      "I'd be happy to help with that. Could you provide more details about what specific aspect you're interested in?",
      "Excellent question! Based on my training expertise, I can offer several approaches. What's your primary objective?",
      "That's something I can definitely assist with. Are you looking for best practices, technical guidance, or implementation support?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-blue-600 hover:text-blue-700 p-0"
        >
          ← Back to Menu
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
            
            <div className={`max-w-[80%] rounded-lg p-3 ${
              message.sender === 'user' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              <p className="text-sm">{message.content}</p>
              <span className="text-xs opacity-70 mt-1 block">
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
            <div className="bg-gray-100 rounded-lg p-3">
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

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about training, LMS features, or content creation..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="bg-blue-600 hover:bg-blue-700 px-3"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
