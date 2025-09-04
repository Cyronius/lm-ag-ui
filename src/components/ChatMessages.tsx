import React, { useEffect, useRef } from "react";
import { Typography, CircularProgress } from "@mui/material";
import "./ChatInterface.css";
import "./ChatMessages.css";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAgentContext } from "../contexts/AgentClientContext";
import ChatMessage from "./ChatMessage";

export default function ChatMessages() {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const {
        session,
        tools,
        messages,
        globalState,
        updateState,
        currentMessage: agentCurrentMessage,
        getToolNameFromCallId,
    } = useAgentContext();

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            const container = messagesEndRef.current.parentElement;
            if (
                container &&
                container.classList.contains("chat-messages-container")
            ) {
                // Since we set the chat container height to full height, there's some weirdness when calculating scroll height
                // where it's initially 0 and it needs to be in a timeout.
                setTimeout(() => {
                    container.scrollTop = container.scrollHeight;
                }, 1)
            } else {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, agentCurrentMessage]);

    return (
        <>
            {messages.map((message, i) => {
                return (
                    <ChatMessage
                        key={message.id || i}
                        message={message}
                        tools={tools}
                        globalState={globalState}
                        getToolNameFromCallId={getToolNameFromCallId}
                        updateState={updateState}
                    />
                );
            })}
            {session.isActive && (
                <div className="message assistant">
                    <div className="bot-icon">
                        <img
                            src="gabe-bot.png"
                            alt="Bot Icon"
                            className="bot-icon"
                        />
                    </div>
                    <div className="message-content assistant">
                        <Typography variant="body2" component="div">
                            {agentCurrentMessage ? (
                                <Markdown remarkPlugins={[remarkGfm]}>
                                    {agentCurrentMessage}
                                </Markdown>
                            ) : (
                                <div className="typing-indicator">
                                    <CircularProgress size={24} />
                                </div>
                            )}
                        </Typography>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </>
    );
}
