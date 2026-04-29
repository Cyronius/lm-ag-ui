import { describe, it, expect } from 'vitest';
import { IntermediateMessageSuppressor } from '../intermediateMessageSuppressor';

describe('IntermediateMessageSuppressor', () => {
    it('disabled: every text segment streams, nothing is buffered', () => {
        const s = new IntermediateMessageSuppressor(false);
        expect(s.onRunStarted()).toBe('fresh');
        expect(s.onTextMessageStart('m1')).toBe('stream');
        expect(s.onTextMessageStart('m2')).toBe('stream');
        expect(s.isBuffered('m1')).toBe(false);
        expect(s.isBuffered('m2')).toBe(false);
        expect(s.onRunFinished(false)).toEqual({ commit: [], dropped: [] });
    });

    it('fresh run: first text streams, subsequent text in same run buffers', () => {
        const s = new IntermediateMessageSuppressor(true);
        s.onRunStarted();
        expect(s.onTextMessageStart('m1')).toBe('stream');
        expect(s.onTextMessageStart('m2')).toBe('buffer');
        expect(s.isBuffered('m1')).toBe(false);
        expect(s.isBuffered('m2')).toBe(true);
    });

    it('chained run: preserves first-text state across runs in the same turn', () => {
        const s = new IntermediateMessageSuppressor(true);
        // Turn starts; first text streams.
        s.onRunStarted();
        expect(s.onTextMessageStart('m1')).toBe('stream');
        // Tool runner chains a follow-up run.
        s.markChainedRun();
        expect(s.onRunStarted()).toBe('chained');
        // Text in the chained run buffers because first-text was already emitted in m1.
        expect(s.onTextMessageStart('m2')).toBe('buffer');
        expect(s.isBuffered('m2')).toBe(true);
    });

    it('chained run with no prior text in the turn: text in the chained run streams', () => {
        const s = new IntermediateMessageSuppressor(true);
        // Turn starts but emits a tool call only — no text yet.
        s.onRunStarted();
        // Tool runner chains.
        s.markChainedRun();
        s.onRunStarted();
        // Now this is still effectively the "first" text of the turn.
        expect(s.onTextMessageStart('m1')).toBe('stream');
    });

    it('onRunFinished with unflushed tool calls drops the buffer (intermediate narration)', () => {
        const s = new IntermediateMessageSuppressor(true);
        s.onRunStarted();
        s.onTextMessageStart('m1');
        s.markChainedRun();
        s.onRunStarted();
        s.onTextMessageStart('m2');
        s.appendToBuffer('m2', 'middle');
        const decision = s.onRunFinished(true);
        expect(decision.commit).toEqual([]);
        expect(decision.dropped).toEqual([{ messageId: 'm2', text: 'middle' }]);
        // Buffer is cleared after decision.
        expect(s.isBuffered('m2')).toBe(false);
    });

    it('onRunFinished without unflushed tool calls commits the buffer (final answer)', () => {
        const s = new IntermediateMessageSuppressor(true);
        s.onRunStarted();
        s.onTextMessageStart('m1');
        s.markChainedRun();
        s.onRunStarted();
        s.onTextMessageStart('m2');
        s.appendToBuffer('m2', 'final');
        const decision = s.onRunFinished(false);
        expect(decision.commit).toEqual([{ messageId: 'm2', text: 'final' }]);
        expect(decision.dropped).toEqual([]);
        expect(s.isBuffered('m2')).toBe(false);
    });

    it('onRunFinished with empty buffer is a no-op', () => {
        const s = new IntermediateMessageSuppressor(true);
        s.onRunStarted();
        expect(s.onRunFinished(false)).toEqual({ commit: [], dropped: [] });
        expect(s.onRunFinished(true)).toEqual({ commit: [], dropped: [] });
    });

    it('reset clears all turn-scoped state including pending chain flag', () => {
        const s = new IntermediateMessageSuppressor(true);
        s.onRunStarted();
        s.onTextMessageStart('m1');
        s.markChainedRun();
        s.onRunStarted();
        s.onTextMessageStart('m2');
        s.appendToBuffer('m2', 'partial');
        s.reset();
        // After reset, the next run is fresh and the buffer is empty.
        expect(s.onRunStarted()).toBe('fresh');
        expect(s.isBuffered('m2')).toBe(false);
        expect(s.onTextMessageStart('m3')).toBe('stream');
    });

    it('clearPendingChain() makes the next RunStarted fresh again', () => {
        const s = new IntermediateMessageSuppressor(true);
        s.onRunStarted();
        s.onTextMessageStart('m1'); // emits first text
        s.markChainedRun();          // intent: chain
        s.clearPendingChain();       // user typed a fresh message instead
        // Next run is fresh — first-text resets.
        expect(s.onRunStarted()).toBe('fresh');
        expect(s.onTextMessageStart('m2')).toBe('stream');
    });

    it('appendToBuffer accumulates deltas in order', () => {
        const s = new IntermediateMessageSuppressor(true);
        s.onRunStarted();
        s.onTextMessageStart('m1');
        s.markChainedRun();
        s.onRunStarted();
        s.onTextMessageStart('m2');
        s.appendToBuffer('m2', 'one');
        s.appendToBuffer('m2', '-two');
        s.appendToBuffer('m2', '-three');
        const decision = s.onRunFinished(false);
        expect(decision.commit).toEqual([{ messageId: 'm2', text: 'one-two-three' }]);
    });

    it('setEnabled toggles behavior at runtime', () => {
        const s = new IntermediateMessageSuppressor(false);
        s.onRunStarted();
        expect(s.onTextMessageStart('m1')).toBe('stream');
        // Even after first text, disabled means second text still streams.
        expect(s.onTextMessageStart('m2')).toBe('stream');
        s.setEnabled(true);
        // After enabling mid-stream, the suppressor doesn't retroactively know that
        // first-text was emitted (firstTextEmittedThisTurn was never set). Next
        // RunStarted on fresh path will continue to behave correctly.
        s.onRunStarted();
        expect(s.onTextMessageStart('m3')).toBe('stream');
        expect(s.onTextMessageStart('m4')).toBe('buffer');
    });
});
