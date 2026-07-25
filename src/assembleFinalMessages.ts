import type { Message, ToolCall } from '@ag-ui/client';

export interface AssembleInput {
    finalText: string;
    toolCalls: ToolCall[];
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
export function findMostRecentAssistantText(messages: Message[]): string | null {
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
 * Assemble one assistant turn into the running message list. A turn is the unit
 * the model emits in a single "thought": optional preamble text plus zero or
 * more tool calls. Their tool results may already have streamed into
 * existingMessages by the time we get here.
 *
 * Output shape:
 *   - No text and no tool calls → no-op.
 *   - Text only → append assistant(content).
 *   - Tool calls only → append assistant(toolCalls).
 *   - Text + tool calls → ONE assistant message with both fields, spliced
 *     in immediately before any trailing tool-result messages owned by these
 *     tool calls. History stays assistant(content+toolCalls) → tool(result).
 *
 * Duplicate suppression: if the most recent assistant text within the same user
 * turn already matches finalText, drop the duplicate text. When tool calls are
 * also present, the message is still appended for the protocol but its content
 * field is omitted.
 */
export function assembleFinalMessages(input: AssembleInput): AssembleResult {
    const { finalText, toolCalls, existingMessages, streamingMessageId } = input;

    const hasText = !!finalText;
    const hasToolCalls = toolCalls.length > 0;

    if (!hasText && !hasToolCalls) {
        return { messages: existingMessages, suppressedDuplicate: false, announcedAssistantText: null };
    }

    const priorText = hasText ? findMostRecentAssistantText(existingMessages) : null;
    const isDuplicateText = hasText && priorText === finalText;

    // Text-only duplicate → drop entirely.
    if (isDuplicateText && !hasToolCalls) {
        return { messages: existingMessages, suppressedDuplicate: true, announcedAssistantText: null };
    }

    const turnMessage: Message = {
        id: streamingMessageId || `msg_${Date.now()}`,
        role: 'assistant',
    };
    if (hasText && !isDuplicateText) turnMessage.content = finalText;
    if (hasToolCalls) turnMessage.toolCalls = toolCalls;

    // Splice point: walk back over trailing tool-result messages owned by this
    // turn's tool calls. The assistant message must precede its own tool results.
    const ownedToolCallIds = new Set(toolCalls.map(tc => tc.id));
    let spliceIdx = existingMessages.length;
    while (
        spliceIdx > 0 &&
        existingMessages[spliceIdx - 1].role === 'tool' &&
        ownedToolCallIds.has((existingMessages[spliceIdx - 1] as { toolCallId?: string }).toolCallId ?? '')
    ) {
        spliceIdx--;
    }

    const messages = [
        ...existingMessages.slice(0, spliceIdx),
        turnMessage,
        ...existingMessages.slice(spliceIdx),
    ];

    return {
        messages,
        suppressedDuplicate: isDuplicateText,
        announcedAssistantText: hasText && !isDuplicateText ? finalText : null,
    };
}
