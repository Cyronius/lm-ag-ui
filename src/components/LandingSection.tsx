
import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle, BookOpen, Calendar, Users, Sparkles, ArrowRight } from 'lucide-react';

interface LandingSectionProps {
  onOpenChat: () => void;
}

const LandingSection = ({ onOpenChat }: LandingSectionProps) => {
  return (
    <div className="container mx-auto px-6 py-16">
      {/* Header */}
      <header className="text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
          <Sparkles className="w-4 h-4" />
          AI-Powered Training Assistant
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Transform Your Training with
          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent block">
            Conversational AI
          </span>
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
          Get instant answers about training best practices, create custom content with AI assistance, 
          and schedule demos with our intelligent chatbot that understands your learning needs.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Button 
            onClick={onOpenChat}
            size="lg" 
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 text-lg"
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            Start Conversation
          </Button>
          <Button 
            variant="outline" 
            size="lg"
            className="border-2 border-blue-200 hover:border-blue-300 px-8 py-3 text-lg"
          >
            Watch Demo
          </Button>
        </div>
      </header>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
        <FeatureCard
          icon={<BookOpen className="w-8 h-8 text-blue-600" />}
          title="Training Expertise"
          description="Get answers about microlearning, compliance, and instructional design best practices."
        />
        <FeatureCard
          icon={<Sparkles className="w-8 h-8 text-indigo-600" />}
          title="AI Content Creation"
          description="Draft and preview training modules with AI assistance using guided prompts."
        />
        <FeatureCard
          icon={<Calendar className="w-8 h-8 text-green-600" />}
          title="Demo Scheduling"
          description="Schedule product demonstrations directly through the chat interface."
        />
        <FeatureCard
          icon={<Users className="w-8 h-8 text-purple-600" />}
          title="Account Support"
          description="Get guided assistance for creating accounts and accessing LMS features."
        />
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">Ready to revolutionize your training?</h2>
        <p className="text-xl mb-6 opacity-90">
          Experience the power of AI-driven learning assistance today.
        </p>
        <Button 
          onClick={onOpenChat}
          variant="secondary" 
          size="lg"
          className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-3 text-lg"
        >
          Get Started Now
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
};

export default LandingSection;
