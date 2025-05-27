
import React from 'react';
import ChatInterface from '../components/ChatInterface';
import LandingHeader from '../components/LandingHeader';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <LandingHeader />
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <ChatInterface />
      </div>
    </div>
  );
};

export default Index;
