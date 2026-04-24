import type { Message, ToolCall } from '@ag-ui/client';

export interface AssembleInput {
    finalText: string;
    toolCalls: ToolCall[];
    // Subset of toolCalls whose results have NOT yet arrived (frontend-tool execution pending).
    // When empty and toolCalls is non-empty, all tool calls already resolved via backend results.
    pendingToolCallIds: Set<string>;
    // The current message list before assembly — used for duplicate suppression and splicing.
    existingMessages: Message[];
    streamingMessageId: string | null;
}

export interface AssembleResult {
    // The new messages list after assembly (replaces existingMessages).
    messages: Message[];
    // True when a duplicate consecutive assistant text was suppressed.
    suppressedDuplicate: boolean;
    // The assistant text that should be announced via onLifecycleEvent (null when suppressed or empty).
    announcedAssistantText: string | null;
}

/**
 * Assemble the final message list at RunFinished.
 *
 * Branches:
 *   1. No text and no tool calls → no-op (returns existingMessages unchanged).
 *   2. Text only → append assistant(content).
 *   3. Tool calls only → append assistant(toolCalls).
 *   4. Text + tool calls, all backend-resolved → splice assistant(toolCalls) BEFORE the
 *      trailing tool-result block, append assistant(text) AFTER. History stays
 *      assistant(toolCalls) → tool(result) → assistant(text).
 *   5. Text + tool calls, some pending → append one assistant message with both fields.
 *
 * Duplicate suppression: if the last assistant message has the same text and no tool calls
 * are attached to this turn, suppress the duplicate.
 */
export function assembleFinalMessages(input: AssembleInput): AssembleResult {
    const { finalText, toolCalls, pendingToolCallIds, existingMessages, streamingMessageId } = input;

    const hasText = !!finalText;
    const hasToolCalls = toolCalls.length > 0;

    if (!hasText && !hasToolCalls) {
        return { messages: existingMessages, suppressedDuplicate: false, announcedAssistantText: null };
    }

    const allBackendResolved = hasToolCalls && pendingToolCallIds.size === 0;

    // Branch 4: text + tool calls, all already resolved via backend results
    if (hasText && hasToolCalls && allBackendResolved) {
        const toolCallIds = new Set(toolCalls.map(tc => tc.id));
        let spliceIdx = existingMessages.length;
        while (
            spliceIdx > 0 &&
            existingMessages[spliceIdx - 1].role === 'tool' &&
            toolCallIds.has((existingMessages[spliceIdx - 1] as any).toolCallId)
        ) {
            spliceIdx--;
        }
        const toolsMessage: Message = {
            id: `msg_tools_${Date.now()}`,
            role: 'assistant',
            toolCalls,
        };
        const textMessage: Message = {
            id: streamingMessageId || `msg_${Date.now()}`,
            role: 'assistant',
            content: finalText,
        };
        return {
            messages: [
                ...existingMessages.slice(0, spliceIdx),
                toolsMessage,
                ...existingMessages.slice(spliceIdx),
                textMessage,
            ],
            suppressedDuplicate: false,
            announcedAssistantText: finalText,
        };
    }

    // Branches 2, 3, 5: single message with text and/or toolCalls
    const completed: Message = {
        id: streamingMessageId || `msg_${Date.now()}`,
        role: 'assistant',
    };
    if (hasText) completed.content = finalText;
    if (hasToolCalls) completed.toolCalls = toolCalls;

    // Duplicate suppression: only when no tool calls are attached (tool-bearing messages
    // are structurally required and never suppressed).
    const lastMsg = existingMessages[existingMessages.length - 1];
    const isConsecutiveDuplicate =
        !hasToolCalls &&
        hasText &&
        lastMsg?.role === 'assistant' &&
        typeof lastMsg.content === 'string' &&
        lastMsg.content.trim() === finalText;

    if (isConsecutiveDuplicate) {
        return { messages: existingMessages, suppressedDuplicate: true, announcedAssistantText: null };
    }

    return {
        messages: [...existingMessages, completed],
        suppressedDuplicate: false,
        announcedAssistantText: hasText ? finalText : null,
    };
}
