import { describe, it, expect } from 'vitest';
import { assembleFinalMessages } from '../assembleFinalMessages';
import type { Message, ToolCall } from '@ag-ui/client';

const userMsg = (content: string): Message => ({ id: 'u1', role: 'user', content } as Message);
const toolResultMsg = (toolCallId: string): Message =>
    ({ id: `tr_${toolCallId}`, role: 'tool', content: 'ok', toolCallId } as Message);
const assistantTextMsg = (content: string): Message =>
    ({ id: 'a1', role: 'assistant', content } as Message);

const tc = (id: string, name = 'fn'): ToolCall => ({
    id,
    type: 'function',
    function: { name, arguments: '{}' },
});

describe('assembleFinalMessages', () => {
    it('text-only: appends an assistant message with content', () => {
        const existing = [userMsg('hi')];
        const r = assembleFinalMessages({
            finalText: 'hello there',
            toolCalls: [],
            pendingToolCallIds: new Set(),
            existingMessages: existing,
            streamingMessageId: 'mid',
        });
        expect(r.messages).toHaveLength(2);
        expect(r.messages[1]).toMatchObject({ role: 'assistant', content: 'hello there', id: 'mid' });
        expect(r.suppressedDuplicate).toBe(false);
        expect(r.announcedAssistantText).toBe('hello there');
    });

    it('tools-only: appends an assistant message with toolCalls, no content', () => {
        const existing = [userMsg('hi')];
        const r = assembleFinalMessages({
            finalText: '',
            toolCalls: [tc('x1')],
            pendingToolCallIds: new Set(['x1']),
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.messages).toHaveLength(2);
        const msg = r.messages[1];
        expect(msg.role).toBe('assistant');
        expect((msg as any).toolCalls).toHaveLength(1);
        expect((msg as any).content).toBeUndefined();
        expect(r.announcedAssistantText).toBeNull();
    });

    it('text + tools, all backend-resolved: splices toolCalls before tool-result block, appends text after', () => {
        // Simulates: user, tool(result), — where tool results arrived via backend streaming.
        const existing: Message[] = [userMsg('hi'), toolResultMsg('x1')];
        const r = assembleFinalMessages({
            finalText: 'synthesis',
            toolCalls: [tc('x1')],
            pendingToolCallIds: new Set(),
            existingMessages: existing,
            streamingMessageId: null,
        });
        // Expect: user, assistant(toolCalls), tool(result), assistant(text)
        expect(r.messages).toHaveLength(4);
        expect(r.messages[0].role).toBe('user');
        expect(r.messages[1].role).toBe('assistant');
        expect((r.messages[1] as any).toolCalls).toHaveLength(1);
        expect(r.messages[2].role).toBe('tool');
        expect(r.messages[3].role).toBe('assistant');
        expect((r.messages[3] as any).content).toBe('synthesis');
    });

    it('text + pending tools: appends a single assistant message with both fields', () => {
        const existing = [userMsg('hi')];
        const r = assembleFinalMessages({
            finalText: 'preamble',
            toolCalls: [tc('x1')],
            pendingToolCallIds: new Set(['x1']),
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.messages).toHaveLength(2);
        const msg = r.messages[1] as any;
        expect(msg.content).toBe('preamble');
        expect(msg.toolCalls).toHaveLength(1);
    });

    it('suppresses a consecutive duplicate assistant text when no tool calls are attached', () => {
        const existing = [userMsg('hi'), assistantTextMsg('same answer')];
        const r = assembleFinalMessages({
            finalText: 'same answer',
            toolCalls: [],
            pendingToolCallIds: new Set(),
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.messages).toBe(existing);
        expect(r.suppressedDuplicate).toBe(true);
        expect(r.announcedAssistantText).toBeNull();
    });

    it('does NOT suppress a duplicate when tool calls are attached', () => {
        const existing = [userMsg('hi'), assistantTextMsg('text')];
        const r = assembleFinalMessages({
            finalText: 'text',
            toolCalls: [tc('x1')],
            pendingToolCallIds: new Set(['x1']),
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.messages).toHaveLength(3);
        expect(r.suppressedDuplicate).toBe(false);
    });

    it('no text + no tools → no-op', () => {
        const existing = [userMsg('hi')];
        const r = assembleFinalMessages({
            finalText: '',
            toolCalls: [],
            pendingToolCallIds: new Set(),
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.messages).toBe(existing);
        expect(r.suppressedDuplicate).toBe(false);
        expect(r.announcedAssistantText).toBeNull();
    });
});
