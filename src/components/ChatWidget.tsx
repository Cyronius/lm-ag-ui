
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, MessageCircle, Send, Calendar, BookOpen, Users, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import ChatInterface from './ChatInterface';

interface ChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChatWidget = ({ isOpen, onClose }: ChatWidgetProps) => {
  const [currentView, setCurrentView] = useState<'welcome' | 'chat' | 'demo' | 'content'>('welcome');

  const handleQuickAction = (action: string) => {
    console.log(`Quick action triggered: ${action}`);
    if (action === 'chat') {
      setCurrentView('chat');
    } else if (action === 'demo') {
      setCurrentView('demo');
    } else if (action === 'content') {
      setCurrentView('content');
    }
  };

  return (
    <>
      {/* Chat Widget Container */}
      <div className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-300 ease-in-out",
        isOpen ? "w-96 h-[600px]" : "w-16 h-16"
      )}>
        {isOpen ? (
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold">Training Assistant</h3>
                  <p className="text-xs opacity-90">Always here to help</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white hover:bg-white/20 p-1"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {currentView === 'welcome' && (
                <WelcomeView onQuickAction={handleQuickAction} />
              )}
              {currentView === 'chat' && (
                <ChatInterface onBack={() => setCurrentView('welcome')} />
              )}
              {currentView === 'demo' && (
                <DemoScheduling onBack={() => setCurrentView('welcome')} />
              )}
              {currentView === 'content' && (
                <ContentCreation onBack={() => setCurrentView('welcome')} />
              )}
            </div>
          </div>
        ) : (
          <Button
            onClick={() => {}}
            size="lg"
            className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg"
          >
            <MessageCircle className="w-6 h-6" />
          </Button>
        )}
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
    </>
  );
};

const WelcomeView = ({ onQuickAction }: { onQuickAction: (action: string) => void }) => {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          👋 Welcome! How can I help you today?
        </h3>
        <p className="text-gray-600 text-sm">
          I'm here to assist with training questions, content creation, and demo scheduling.
        </p>
      </div>

      <div className="space-y-3 flex-1">
        <QuickActionButton
          icon={<MessageCircle className="w-5 h-5" />}
          title="Ask a Question"
          description="Get training advice and LMS support"
          onClick={() => onQuickAction('chat')}
        />
        <QuickActionButton
          icon={<BookOpen className="w-5 h-5" />}
          title="Create Content"
          description="Generate training modules with AI"
          onClick={() => onQuickAction('content')}
        />
        <QuickActionButton
          icon={<Calendar className="w-5 h-5" />}
          title="Schedule Demo"
          description="Book a product demonstration"
          onClick={() => onQuickAction('demo')}
        />
        <QuickActionButton
          icon={<Users className="w-5 h-5" />}
          title="Account Setup"
          description="Get help creating your account"
          onClick={() => onQuickAction('chat')}
        />
      </div>
    </div>
  );
};

const QuickActionButton = ({ 
  icon, 
  title, 
  description, 
  onClick 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  onClick: () => void; 
}) => {
  return (
    <button
      onClick={onClick}
      className="w-full p-4 text-left rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="text-blue-600 group-hover:text-blue-700 mt-0.5">
          {icon}
        </div>
        <div>
          <h4 className="font-medium text-gray-900 group-hover:text-blue-900">
            {title}
          </h4>
          <p className="text-sm text-gray-600 group-hover:text-blue-700">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
};

const DemoScheduling = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="p-6 h-full">
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-4 text-blue-600 hover:text-blue-700 p-0"
      >
        ← Back
      </Button>
      <h3 className="text-lg font-semibold mb-4">Schedule a Demo</h3>
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            📅 I'll help you schedule a personalized demo of our LMS platform.
          </p>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input 
              type="text" 
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Your name"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input 
              type="email" 
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="your@email.com"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Preferred Time</span>
            <select className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
              <option>Morning (9 AM - 12 PM)</option>
              <option>Afternoon (1 PM - 5 PM)</option>
              <option>Evening (6 PM - 8 PM)</option>
            </select>
          </label>
          <Button className="w-full bg-blue-600 hover:bg-blue-700">
            <Calendar className="w-4 h-4 mr-2" />
            Schedule Demo
          </Button>
        </div>
      </div>
    </div>
  );
};

const ContentCreation = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="p-6 h-full">
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-4 text-blue-600 hover:text-blue-700 p-0"
      >
        ← Back
      </Button>
      <h3 className="text-lg font-semibold mb-4">AI Content Creation</h3>
      <div className="space-y-4">
        <div className="p-4 bg-green-50 rounded-lg">
          <p className="text-sm text-green-800">
            ✨ Let's create engaging training content together!
          </p>
        </div>
        
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Content Type</span>
            <select className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
              <option>Compliance Training</option>
              <option>Onboarding Module</option>
              <option>Skills Assessment</option>
              <option>Microlearning Unit</option>
            </select>
          </label>
          
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Topic</span>
            <input 
              type="text" 
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="e.g., Workplace Safety, Customer Service"
            />
          </label>
          
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Duration</span>
            <select className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
              <option>5-10 minutes</option>
              <option>15-20 minutes</option>
              <option>30-45 minutes</option>
              <option>1 hour+</option>
            </select>
          </label>
          
          <Button className="w-full bg-green-600 hover:bg-green-700">
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Content
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatWidget;
