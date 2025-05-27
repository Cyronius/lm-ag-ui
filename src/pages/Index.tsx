
import React, { useState } from 'react';
import ChatWidget from '../components/ChatWidget';
import LandingSection from '../components/LandingSection';

const Index = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <LandingSection onOpenChat={() => setIsChatOpen(true)} />
      <ChatWidget isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
};

export default Index;
