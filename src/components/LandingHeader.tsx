
import React from 'react';
import { Sparkles } from 'lucide-react';

const LandingHeader = () => {
  return (
    <header className="text-center py-12 px-6">
      <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
        <Sparkles className="w-4 h-4" />
        AI-Powered Training Assistant
      </div>
      <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
        Your AI Training Assistant
      </h1>
      <p className="text-lg text-gray-600 max-w-2xl mx-auto">
        Ask questions, create content, schedule demos, or get account help - all through natural conversation.
      </p>
    </header>
  );
};

export default LandingHeader;
