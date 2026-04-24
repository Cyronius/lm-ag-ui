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

// Walks backward through messages, skipping `tool` messages and assistant messages
// that carry only `toolCalls` (no string content). Returns the trimmed text of the
// most recent assistant message with non-empty string content, or null if a
// user / system / developer turn boundary is reached first.
function findMostRecentAssistantText(messages: Message[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'tool') continue;
        if (m.role === 'assistant') {
            const hasText = typeof m.content === 'string' && m.content.trim().length > 0;
            if (hasText) return (m.content as string).trim();
            continue;
        }
        return null;
    }
    return null;
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
 * Duplicate suppression (branches 2, 4, 5): if a recent assistant message in the
 * same user turn already has the same text, drop the duplicate. In branch 5 the
 * combined message is still appended for its required toolCalls, but its content
 * is omitted.
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
        // Tool results sometimes stream in before the assistant message that owns them.
        // Walk back over any trailing tool-result messages belonging to this turn so we
        // can splice the assistant(toolCalls) message in front of them.
        const ownedToolCallIds = new Set(toolCalls.map(tc => tc.id));
        let spliceIdx = existingMessages.length;
        while (
            spliceIdx > 0 &&
            existingMessages[spliceIdx - 1].role === 'tool' &&
            ownedToolCallIds.has((existingMessages[spliceIdx - 1] as any).toolCallId)
        ) {
            spliceIdx--;
        }

        const before = existingMessages.slice(0, spliceIdx);
        const tail = existingMessages.slice(spliceIdx);
        const toolsMessage: Message = {
            id: `msg_tools_${Date.now()}`,
            role: 'assistant',
            toolCalls,
        };

        // Check the prior-round preamble within this user turn (skipping tool messages
        // and assistant messages that only carry toolCalls). If the model regenerated
        // the same preamble, suppress the new copy.
        const priorText = findMostRecentAssistantText(before);
        const isDuplicateTrailingText = priorText !== null && priorText === finalText;

        const messages = isDuplicateTrailingText
            ? [...before, toolsMessage, ...tail]
            : [
                  ...before,
                  toolsMessage,
                  ...tail,
                  { id: streamingMessageId || `msg_${Date.now()}`, role: 'assistant', content: finalText } as Message,
              ];

        return {
            messages,
            suppressedDuplicate: isDuplicateTrailingText,
            announcedAssistantText: isDuplicateTrailingText ? null : finalText,
        };
    }

    // Branches 2, 3, 5: single message with text and/or toolCalls.
    // Detect a duplicate preamble across the current user turn so it can be omitted
    // even when the new message has toolCalls (tool-bearing messages are still
    // appended for the protocol; only their content is suppressed).
    const priorText = hasText ? findMostRecentAssistantText(existingMessages) : null;
    const isDuplicateText = hasText && priorText === finalText;

    // Tool-only branch with no text → trivial dedup not relevant.
    // Text-only branch with duplicate text → drop the message entirely.
    if (isDuplicateText && !hasToolCalls) {
        return { messages: existingMessages, suppressedDuplicate: true, announcedAssistantText: null };
    }

    const completed: Message = {
        id: streamingMessageId || `msg_${Date.now()}`,
        role: 'assistant',
    };
    if (hasText && !isDuplicateText) completed.content = finalText;
    if (hasToolCalls) completed.toolCalls = toolCalls;

    return {
        messages: [...existingMessages, completed],
        suppressedDuplicate: isDuplicateText,
        announcedAssistantText: hasText && !isDuplicateText ? finalText : null,
    };
}
