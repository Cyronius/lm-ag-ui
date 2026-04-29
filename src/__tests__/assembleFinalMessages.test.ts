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

    it('text + tools, all backend-resolved: splices a single assistant(text+toolCalls) before the tool-result block', () => {
        // Simulates: user, tool(result), — where tool results arrived via backend streaming.
        const existing: Message[] = [userMsg('hi'), toolResultMsg('x1')];
        const r = assembleFinalMessages({
            finalText: 'preamble',
            toolCalls: [tc('x1')],
            existingMessages: existing,
            streamingMessageId: null,
        });
        // Per-turn shape: user, assistant(content+toolCalls), tool(result).
        expect(r.messages).toHaveLength(3);
        expect(r.messages[0].role).toBe('user');
        expect(r.messages[1].role).toBe('assistant');
        expect((r.messages[1] as any).content).toBe('preamble');
        expect((r.messages[1] as any).toolCalls).toHaveLength(1);
        expect(r.messages[2].role).toBe('tool');
        expect(r.announcedAssistantText).toBe('preamble');
    });

    it('text + tools all backend-resolved: suppresses duplicate trailing text from prior round', () => {
        const existing: Message[] = [
            userMsg('hi'),
            { id: 'a_tc_A', role: 'assistant', toolCalls: [tc('A')] } as Message,
            toolResultMsg('A'),
            assistantTextMsg('preamble'),
            toolResultMsg('B'),
        ];
        const r = assembleFinalMessages({
            finalText: 'preamble',
            toolCalls: [tc('B')],
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.suppressedDuplicate).toBe(true);
        expect(r.announcedAssistantText).toBeNull();
        // Last message should be the spliced tools message, then the tool result — no trailing text appended.
        const trailingTexts = r.messages.filter(
            m => m.role === 'assistant' && typeof (m as any).content === 'string' && (m as any).content === 'preamble'
        );
        expect(trailingTexts).toHaveLength(1); // only the original from the prior round
        expect(r.messages[r.messages.length - 1].role).toBe('tool');
    });

    it('text + tools all backend-resolved: keeps text on the spliced assistant message when content differs', () => {
        const existing: Message[] = [
            userMsg('hi'),
            { id: 'a_tc_A', role: 'assistant', content: 'preamble', toolCalls: [tc('A')] } as Message,
            toolResultMsg('A'),
            toolResultMsg('B'),
        ];
        const r = assembleFinalMessages({
            finalText: 'different preamble',
            toolCalls: [tc('B')],
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.suppressedDuplicate).toBe(false);
        expect(r.announcedAssistantText).toBe('different preamble');
        // The new assistant message must precede tool_result for B.
        // Shape: user, assistant(text=preamble, toolCalls=[A]), tool(A), assistant(text=different preamble, toolCalls=[B]), tool(B)
        expect(r.messages).toHaveLength(5);
        expect(r.messages[3].role).toBe('assistant');
        expect((r.messages[3] as any).content).toBe('different preamble');
        expect((r.messages[3] as any).toolCalls).toHaveLength(1);
        expect(r.messages[4].role).toBe('tool');
        expect((r.messages[4] as any).toolCallId).toBe('B');
    });

    it('text + pending tools: appends a single assistant message with both fields', () => {
        const existing = [userMsg('hi')];
        const r = assembleFinalMessages({
            finalText: 'preamble',
            toolCalls: [tc('x1')],
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
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.messages).toBe(existing);
        expect(r.suppressedDuplicate).toBe(true);
        expect(r.announcedAssistantText).toBeNull();
    });

    it('still appends a tool-bearing message when text duplicates prior, but drops the duplicate text', () => {
        const existing = [userMsg('hi'), assistantTextMsg('text')];
        const r = assembleFinalMessages({
            finalText: 'text',
            toolCalls: [tc('x1')],
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.messages).toHaveLength(3);
        expect(r.suppressedDuplicate).toBe(true);
        const appended = r.messages[2] as any;
        expect(appended.content).toBeUndefined();
        expect(appended.toolCalls).toHaveLength(1);
    });

    it('text + pending tools: drops duplicate text from prior round, keeps toolCalls', () => {
        const existing: Message[] = [
            userMsg('hi'),
            { id: 'a1', role: 'assistant', content: 'preamble', toolCalls: [tc('A')] } as Message,
            toolResultMsg('A'),
        ];
        const r = assembleFinalMessages({
            finalText: 'preamble',
            toolCalls: [tc('B')],
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.suppressedDuplicate).toBe(true);
        expect(r.announcedAssistantText).toBeNull();
        expect(r.messages).toHaveLength(4);
        const last = r.messages[3] as any;
        expect(last.role).toBe('assistant');
        expect(last.content).toBeUndefined();
        expect(last.toolCalls).toHaveLength(1);
    });

    it('text + pending tools: keeps text when content differs from prior round', () => {
        const existing: Message[] = [
            userMsg('hi'),
            { id: 'a1', role: 'assistant', content: 'preamble', toolCalls: [tc('A')] } as Message,
            toolResultMsg('A'),
        ];
        const r = assembleFinalMessages({
            finalText: 'different preamble',
            toolCalls: [tc('B')],
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.suppressedDuplicate).toBe(false);
        expect(r.announcedAssistantText).toBe('different preamble');
        const last = r.messages[r.messages.length - 1] as any;
        expect(last.content).toBe('different preamble');
        expect(last.toolCalls).toHaveLength(1);
    });

    it('Branch 4: walks past trailing non-owned tool result to find duplicate preamble', () => {
        // Existing has a prior preamble followed by a tool result that does NOT belong
        // to the new round. The previous adjacency-only check would see `tool` as `prev`
        // and miss the duplicate; the helper walks past it.
        const existing: Message[] = [
            userMsg('hi'),
            { id: 'a_tc_A', role: 'assistant', toolCalls: [tc('A')] } as Message,
            assistantTextMsg('preamble'),
            toolResultMsg('A'),
        ];
        const r = assembleFinalMessages({
            finalText: 'preamble',
            toolCalls: [tc('B')],
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.suppressedDuplicate).toBe(true);
        expect(r.announcedAssistantText).toBeNull();
        const trailingTexts = r.messages.filter(
            m => m.role === 'assistant' && typeof (m as any).content === 'string' && (m as any).content === 'preamble'
        );
        expect(trailingTexts).toHaveLength(1);
    });

    it('helper stops at user turn boundary — same text in a prior turn is not a duplicate', () => {
        const existing: Message[] = [
            userMsg('first turn'),
            assistantTextMsg('preamble'),
            userMsg('second turn'),
        ];
        const r = assembleFinalMessages({
            finalText: 'preamble',
            toolCalls: [tc('X')],
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.suppressedDuplicate).toBe(false);
        const last = r.messages[r.messages.length - 1] as any;
        expect(last.content).toBe('preamble');
        expect(last.toolCalls).toHaveLength(1);
    });

    it('no text + no tools → no-op', () => {
        const existing = [userMsg('hi')];
        const r = assembleFinalMessages({
            finalText: '',
            toolCalls: [],
            existingMessages: existing,
            streamingMessageId: null,
        });
        expect(r.messages).toBe(existing);
        expect(r.suppressedDuplicate).toBe(false);
        expect(r.announcedAssistantText).toBeNull();
    });
});
