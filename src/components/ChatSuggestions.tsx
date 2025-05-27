
import React from 'react';
import { MessageCircle, BookOpen, Calendar, Users } from 'lucide-react';

interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

const ChatSuggestions = ({ onSuggestionClick }: ChatSuggestionsProps) => {
  const suggestions = [
    {
      icon: <MessageCircle className="w-4 h-4" />,
      text: "Ask a training question",
      prompt: "I have a question about training best practices"
    },
    {
      icon: <BookOpen className="w-4 h-4" />,
      text: "Create content with AI",
      prompt: "I'd like to create training content with AI assistance"
    },
    {
      icon: <Calendar className="w-4 h-4" />,
      text: "Schedule a demo",
      prompt: "I want to schedule a demo of your LMS platform"
    },
    {
      icon: <Users className="w-4 h-4" />,
      text: "Account setup help",
      prompt: "I need help setting up my account"
    }
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSuggestionClick(suggestion.prompt)}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all"
        >
          {suggestion.icon}
          {suggestion.text}
        </button>
      ))}
    </div>
  );
};

export default ChatSuggestions;
