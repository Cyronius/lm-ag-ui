import React, { RefObject } from 'react';
import { Typography, CircularProgress } from '@mui/material';
import { Bot, User } from 'lucide-react';
import './ChatInterface.css';
import './ChatMessages.css';
import { AgentStateMessage, ImageMessage, Message, MessageRole, TextMessage, TextMessageInput } from '@copilotkit/runtime-client-gql';
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatEvent, Content } from '../types';
import { useCopilotChat } from '@copilotkit/react-core';

function getMessageRole(message: Message): MessageRole | undefined {
  if (message instanceof TextMessage) {
    return message.role;
  } else if (message instanceof AgentStateMessage) {
    return message.role;
  } else if (message instanceof ImageMessage) {
    return message.role;
  }
  return undefined;
}

export default function ChatMessages({ messagesEndRef }: { messagesEndRef: RefObject<HTMLDivElement | null>}) {
    
        const {
        visibleMessages,    // An array of messages that are currently visible in the chat.
        appendMessage,      // A function to append a message to the chat.
        setMessages,        // A function to set the messages in the chat.
        deleteMessage,      // A function to delete a message from the chat.
        reloadMessages,     // A function to reload the messages from the API.
        stopGeneration,     // A function to stop the generation of the next message.
        reset,              // A function to reset the chat.
        isLoading,          // A boolean indicating if the chat is loading.
    } = useCopilotChat();
    
    return <>
        {
            visibleMessages.map((message, i) => {

                const role = getMessageRole(message)

                return (
                    <div key={i} className={`message ${role}`}>
                        {role !== 'user' && (
                            <div className="bot-icon">
                                <img src="gabe-bot.png" alt="Bot Icon" className="bot-icon" />
                            </div>
                        )}

                        {message.isTextMessage() &&
                            <div className={`message-content ${role}`}>
                            
                                <Typography variant="body2" component="div">
                                    <Markdown remarkPlugins={[remarkGfm]}>
                                        {(message as TextMessageInput).content}
                                    </Markdown>
                                </Typography>
                            
                            </div>
                        }

                        {role === 'user' && (
                            <div className="user-icon">
                                <User className="icon" />
                            </div>
                        )}
                    </div>
                )
            })
        }
        {
            isLoading && (
                <div className="typing-indicator">
                    <CircularProgress size={24} />
                </div>
            )
        }
        <div ref={messagesEndRef} />
    </>
}
