import React from "react";
import { Typography } from "@mui/material";
import { User, Settings, Code } from "lucide-react";
import "./ChatInterface.css";
import "./ChatMessages.css";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "@ag-ui/core";
import { ToolDefinition } from "../types";

interface ChatMessageProps {
    message: Message;
    tools: Record<string, ToolDefinition>;
    globalState: any;
    getToolNameFromCallId: (toolCallId: string) => string | undefined;
    updateState: (toolName: string, data: any) => void;
    allMessages?: Message[];
    currentIndex?: number;
}

function renderMessage(
    message: Message,
    tools: Record<string, any>,
    globalState: any,
    getToolNameFromCallId: (toolCallId: string) => string | undefined,
    updateState: (toolName: string, data: any) => void
) {
    switch (message.role) {
        case "user":
            return (
                <div className="message-content user">
                    <Typography variant="body2" component="div">
                        <Markdown remarkPlugins={[remarkGfm]}>
                            {message.content || ""}
                        </Markdown>
                    </Typography>
                </div>
            );

        case "assistant":
            return (
                <div className="message-content assistant">
                    <Typography variant="body2" component="div">
                        <Markdown remarkPlugins={[remarkGfm]}>
                            {message.content || ""}
                        </Markdown>
                    </Typography>
                </div>
            );

        case "tool":
            return renderToolMessage(
                message,
                tools,
                globalState,
                getToolNameFromCallId,
                updateState
            );

        case "system":
            return (
                <div className="message-content system">
                    <Typography
                        variant="caption"
                        component="div"
                        sx={{ fontStyle: "italic", color: "text.secondary" }}
                    >
                        System: {message.content}
                    </Typography>
                </div>
            );

        case "developer":
            return (
                <div className="message-content developer">
                    <Typography
                        variant="caption"
                        component="div"
                        sx={{
                            fontFamily: "monospace",
                            color: "text.secondary",
                        }}
                    >
                        Dev: {message.content}
                    </Typography>
                </div>
            );
    }
}

function renderToolMessage(
    message: Message,
    tools: Record<string, any>,
    globalState: any,
    getToolNameFromCallId: (toolCallId: string) => string | undefined,
    updateState: (toolName: string, data: any) => void
) {
    // Get the tool name from the toolCallId mapping
    let toolName = "";
    const toolCallId =
        message.role === "tool" && "toolCallId" in message
            ? (message as any).toolCallId
            : undefined;
    if (toolCallId) {
        toolName = getToolNameFromCallId(toolCallId) || "";
    }

    if (!toolName) {
        console.error(
            `couldn't find tool with id ${toolCallId}, so skipping rendering`
        );
        return;
    }

    const tool = tools[toolName];

    // tool not being found is not necessarily a problem -- the frontend doesn't know about every tool the backend has and vice versa
    if (!tool) {
        return;
    }

    // if this tool has no renderer -- no need to do anything
    if (!tool.renderer) {
        return;
    }

    // Parse args from message content, handling one level of result property
    let args: any = {};
    try {
        args = JSON.parse(message.content || "{}");
        if (args.result !== undefined) {
            // Try to parse result as JSON, otherwise use as is
            try {
                args = JSON.parse(args.result);
            } catch {
                args = args.result;
            }
        }
    } catch {
        // If content isn't JSON, use it as is. Probably just some text.
        args = message.content;
    }

    // Call the tool's renderer with state management functions
    const renderResult = tool.renderer(
        args,
        message.content || "",
        updateState
    );

    // If the renderer returns JSX, render it
    if (!React.isValidElement(renderResult)) {
        return;
    }

    return <div className="message-content tool">{renderResult}</div>;
}

function getMessageIcon(role: string) {
    switch (role) {
        case "assistant":
            return (
                <img src="lm-chat-icon.png" alt="Learner Mobile Chat Avatar" className="bot-icon" />
            );
        case "user":
            return <User className="icon" />;
        case "tool":
            return null;
        case "system":
            return <Settings className="icon" />;
        case "developer":
            return <Code className="icon" />;
        default:
            return null;
    }
}

const ChatMessage = React.memo(
    ({
        message,
        tools,
        globalState,
        getToolNameFromCallId,
        updateState,
        allMessages = [],
        currentIndex = -1,
    }: ChatMessageProps) => {
        // Check if this is a course outline tool message that should be hidden
        if (message.role === "tool" && currentIndex >= 0 && allMessages.length > 0) {
            const toolCallId =
                "toolCallId" in message ? (message as any).toolCallId : undefined;
            const toolName = toolCallId ? getToolNameFromCallId(toolCallId) : "";

            // If this is an outline tool message
            if (toolName === "soco_outline_tool" || toolName === "soco_multiple_outlines_tool") {
                // Check if there's a more recent outline tool message after this one
                const hasMoreRecentOutline = allMessages.slice(currentIndex + 1).some((laterMsg) => {
                    if (laterMsg.role !== "tool") return false;
                    const laterToolCallId =
                        "toolCallId" in laterMsg ? (laterMsg as any).toolCallId : undefined;
                    const laterToolName = laterToolCallId
                        ? getToolNameFromCallId(laterToolCallId)
                        : "";
                    return (
                        laterToolName === "soco_outline_tool" ||
                        laterToolName === "soco_multiple_outlines_tool"
                    );
                });

                // If there's a more recent outline, hide this one with CSS (keep component mounted)
                if (hasMoreRecentOutline) {
                    return <div style={{ display: 'none' }}>{renderMessage(
                        message,
                        tools,
                        globalState,
                        getToolNameFromCallId,
                        updateState
                    )}</div>;
                }
            }
        }

        let results = renderMessage(
            message,
            tools,
            globalState,
            getToolNameFromCallId,
            updateState
        );
        if (!results) {
            return null;
        }

        return (
            <div className={`message ${message.role}`}>
                {(message.role === "assistant" ||
                    message.role === "system" ||
                    message.role === "developer") && (
                    <div className="bot-icon">
                        {getMessageIcon(message.role)}
                    </div>
                )}
                {results}
            </div>
        );
    }
);

export default ChatMessage;
