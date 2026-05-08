export interface BufferedSegment {
    messageId: string;
    text: string;
}

export interface RunFinishedDecision {
    commit: BufferedSegment[];
    dropped: BufferedSegment[];
}

/**
 * State machine for `suppressIntermediateAssistantMessages`. When enabled, only
 * the first and final assistant text segments of a user turn are committed to
 * the message list; intermediate narration during agentic chains is dropped.
 *
 * A "turn" begins on a fresh user-initiated `RunStarted` and continues across
 * any `RunStarted` events that follow a frontend-tool-result submission
 * (signalled by `markChainedRun()`). Within a turn:
 *   - The first text segment streams live (caller passes through to the reducer).
 *   - Subsequent segments are buffered until `RunFinished`.
 *   - At `RunFinished` the buffer is committed if no tool calls fired in the
 *     run (i.e. this was the final run of the turn) or dropped otherwise.
 */
export class IntermediateMessageSuppressor {
    private firstTextEmittedThisTurn = false;
    private chainedRunPending = false;
    private bufferedSegments: BufferedSegment[] = [];
    private bufferedMessageIds = new Set<string>();

    constructor(private _enabled: boolean) {}

    setEnabled(v: boolean): void { this._enabled = v; }
    get enabled(): boolean { return this._enabled; }

    /** Called by the frontend tool runner immediately before submitting tool results. */
    markChainedRun(): void { this.chainedRunPending = true; }

    /** Defensive: called when a fresh user-initiated run is about to start, so a
     *  pending chain flag from a prior turn cannot bleed into this one. */
    clearPendingChain(): void { this.chainedRunPending = false; }

    /** Called on RUN_STARTED. Returns 'fresh' (turn-scoped state was reset) or
     *  'chained' (turn-scoped state preserved). */
    onRunStarted(): 'fresh' | 'chained' {
        if (!this._enabled) return 'fresh';
        if (this.chainedRunPending) {
            this.chainedRunPending = false;
            return 'chained';
        }
        this.firstTextEmittedThisTurn = false;
        this.bufferedSegments = [];
        this.bufferedMessageIds.clear();
        return 'fresh';
    }

    /** Called on TEXT_MESSAGE_START. Returns 'stream' (let the caller forward
     *  the segment to the reducer) or 'buffer' (the suppressor will hold the
     *  segment until RUN_FINISHED). */
    onTextMessageStart(messageId: string): 'stream' | 'buffer' {
        if (!this._enabled) return 'stream';
        if (this.firstTextEmittedThisTurn) {
            this.bufferedMessageIds.add(messageId);
            this.bufferedSegments.push({ messageId, text: '' });
            return 'buffer';
        }
        this.firstTextEmittedThisTurn = true;
        return 'stream';
    }

    isBuffered(messageId: string): boolean {
        return this.bufferedMessageIds.has(messageId);
    }

    appendToBuffer(messageId: string, delta: string): void {
        const seg = this.bufferedSegments.find(s => s.messageId === messageId);
        if (seg) seg.text += delta;
    }

    getBufferedText(messageId: string): string | undefined {
        return this.bufferedSegments.find(s => s.messageId === messageId)?.text;
    }

    /** Called on RUN_FINISHED, BEFORE any tool buffers are cleared. Caller passes
     *  whether the just-finished run had any unflushed tool calls. Returns the
     *  segments to commit (final-run case) and segments to drop (intermediate-run case). */
    onRunFinished(hasUnflushedToolCall: boolean): RunFinishedDecision {
        if (this.bufferedSegments.length === 0) return { commit: [], dropped: [] };
        const decision: RunFinishedDecision = hasUnflushedToolCall
            ? { commit: [], dropped: this.bufferedSegments }
            : { commit: this.bufferedSegments, dropped: [] };
        this.bufferedSegments = [];
        this.bufferedMessageIds.clear();
        return decision;
    }

    /** Called on RUN_ERROR. Clears all turn-scoped state including the pending
     *  chain flag — the turn is aborted. */
    reset(): void {
        this.firstTextEmittedThisTurn = false;
        this.chainedRunPending = false;
        this.bufferedSegments = [];
        this.bufferedMessageIds.clear();
    }
}
