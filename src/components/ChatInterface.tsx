import React, { useState, useRef, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import { Send } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import ChatMessages from './ChatMessages';
import { ArtifactRenderer } from './artifacts';
import './ChatInterface.css';
import {
    Message,
    TextMessageContentEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent
} from '@ag-ui/core';
import { ArtifactData, AgentSubscriber } from '../types/index';
import { AgentService } from '../services/AgentService';
import { useSessionManager } from '../hooks/useSessionManager';
import { useAgent } from '../hooks/useAgent';
import { allTools } from '../tools/availableTools';

export default function ChatInterface() {


  // agent / session setup
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [artifacts, setArtifacts] = useState<Map<string, ArtifactData>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const agentService = useRef(new AgentService());
  const { sessionState, startNewRun, endRun } = useSessionManager();
  
   // FRONTEND tool dispatcher
  const handleFrontendToolCall = (tool: { name: string; parameters: any }) => {
    if (tool.name === "showCalendlyWidget") {
      setMessages(m => [
        ...m,
        {
          id: `calendly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          type: 'calendly',
          calendlyUrl: tool.parameters.url,
          calendlyHeight: tool.parameters.height || 500,
          content: '',
        }
      ]);
    }
    // TODO: handle other frontend tools...
  };

  // GENERIC handler for any tool-call emitted by the agent
  const handleAgentToolCall = (toolCall: any) => {
    if (toolCall.type === 'function' && toolCall.function) {
      const name = toolCall.function.name;
      const raw = toolCall.function.arguments;
      const args: Record<string, any> = raw ? JSON.parse(raw) : {};

      // all params present → dispatch to frontend
      if (name === 'book_demo_func') {
        // backend → frontend mapping
        handleFrontendToolCall({ name: 'showCalendlyWidget', parameters: args });
      } else {
        handleFrontendToolCall({ name, parameters: args });
      }
    }
  };

  const {
    agentSubscriber,
    isStreaming: agentIsStreaming,
    currentMessage: agentCurrentMessage
  } = useAgent({
    onMessageComplete: msg => setMessages(m => [...m, msg]),
    onErrorMessage: err => setMessages(m => [...m, err]),
    setArtifacts,
    endRun,
    onToolCall: handleAgentToolCall
  });

  // Scroll on new messages
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages, agentCurrentMessage]);


  // user sends a message
  const handleSendMessage = async (overrideText?: string) => {
    const text = overrideText ?? inputValue;
    if (!text.trim() || agentIsStreaming) return;

    // add user message
    const userMsg: Message = { id: `user_${Date.now()}`, role: 'user', content: text };
    setMessages(m => [...m, userMsg]);
    setInputValue('');

    // kick off a normal agent run
    setIsStreaming(true);
    const runState = startNewRun();
    try {
      const result = await agentService.current.runAgent(
        [...messages, userMsg],
        allTools,
        agentSubscriber,
        runState
      );
      // any toolCalls in result.newMessages will be routed via our onToolCall
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const showSuggestions = messages.length === 0 && !agentIsStreaming;

  return (
    <div className="chat-interface">
      <ChatMessages
        messages={messages}
        isTyping={agentIsStreaming}
        currentMessage={agentCurrentMessage}
        messagesEndRef={messagesEndRef}
      />
      <ArtifactRenderer artifacts={artifacts} />

      <div className="input-container">
        <TextField
          inputRef={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyUp={handleKeyPress}
          placeholder="Ask me anything about training!"
          variant="outlined"
          fullWidth
          disabled={agentIsStreaming}
        />
        <Button
          onClick={() => handleSendMessage()}
          disabled={!inputValue.trim() || agentIsStreaming}
          variant="contained"
        >
          <Send />
        </Button>
      </div>

      <div className="suggestions-container">
        {showSuggestions && (
          <ChatSuggestions onSuggestionClick={handleSendMessage} />
        )}
      </div>

      <div ref={messagesEndRef} />
    </div>
  );
}
