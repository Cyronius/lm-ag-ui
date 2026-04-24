import { describe, it, expect } from 'vitest';
import { agentReducer, initialAgentState, AgentState } from '../agentReducer';
import type { Message } from '@ag-ui/client';

const userMsg = (content: string): Message => ({ id: 'u1', role: 'user', content } as Message);
const toolMsg = (toolCallId: string, content = 'ok'): Message =>
    ({ id: `t_${toolCallId}`, role: 'tool', content, toolCallId } as Message);

describe('agentReducer', () => {
    describe('text delta accumulation', () => {
        it('accumulates deltas and tracks streamingMessageId', () => {
            let s = initialAgentState;
            s = agentReducer(s, { type: 'TEXT_DELTA', messageId: 'm1', delta: 'Hel' });
            s = agentReducer(s, { type: 'TEXT_DELTA', messageId: 'm1', delta: 'lo ' });
            s = agentReducer(s, { type: 'TEXT_DELTA', messageId: 'm1', delta: 'world' });
            expect(s.streamingText).toBe('Hello world');
            expect(s.streamingMessageId).toBe('m1');
        });

        it('CLEAR_STREAMING resets both text and id', () => {
            const seeded: AgentState = { ...initialAgentState, streamingText: 'xyz', streamingMessageId: 'm' };
            const s = agentReducer(seeded, { type: 'CLEAR_STREAMING' });
            expect(s.streamingText).toBe('');
            expect(s.streamingMessageId).toBeNull();
        });
    });

    describe('tool call buffer assembly', () => {
        it('start + args accumulate into a single buffer', () => {
            let s = initialAgentState;
            s = agentReducer(s, { type: 'TOOL_CALL_START', toolCallId: 'tc1', name: 'doThing', parentMessageId: 'p1' });
            s = agentReducer(s, { type: 'TOOL_CALL_ARGS', toolCallId: 'tc1', delta: '{"a"' });
            s = agentReducer(s, { type: 'TOOL_CALL_ARGS', toolCallId: 'tc1', delta: ':1}' });
            const buf = s.toolCallBuffers.get('tc1')!;
            expect(buf.name).toBe('doThing');
            expect(buf.argsBuffer).toBe('{"a":1}');
            expect(buf.parentMessageId).toBe('p1');
            expect(buf.resultReceived).toBeUndefined();
            expect(s.toolCallIdToName.get('tc1')).toBe('doThing');
        });

        it('ARGS for unknown toolCallId is a no-op', () => {
            const s = agentReducer(initialAgentState, { type: 'TOOL_CALL_ARGS', toolCallId: 'nope', delta: 'x' });
            expect(s).toBe(initialAgentState);
        });

        it('TOOL_CALL_RESULT appends a tool message and marks resultReceived', () => {
            let s = initialAgentState;
            s = agentReducer(s, { type: 'TOOL_CALL_START', toolCallId: 'tc1', name: 'fn' });
            s = agentReducer(s, {
                type: 'TOOL_CALL_RESULT',
                toolCallId: 'tc1',
                message: toolMsg('tc1'),
            });
            expect(s.messages).toHaveLength(1);
            expect(s.messages[0].role).toBe('tool');
            expect(s.toolCallBuffers.get('tc1')!.resultReceived).toBe(true);
        });

        it('CLEAR_TOOL_BUFFERS empties buffers but preserves the name map', () => {
            let s = initialAgentState;
            s = agentReducer(s, { type: 'TOOL_CALL_START', toolCallId: 'tc1', name: 'fn' });
            s = agentReducer(s, { type: 'CLEAR_TOOL_BUFFERS' });
            expect(s.toolCallBuffers.size).toBe(0);
            expect(s.toolCallIdToName.get('tc1')).toBe('fn');
        });
    });

    describe('abort / terminate transitions', () => {
        it('SET_ABORTED toggles the flag', () => {
            let s = agentReducer(initialAgentState, { type: 'SET_ABORTED', value: true });
            expect(s.isAborted).toBe(true);
            s = agentReducer(s, { type: 'SET_ABORTED', value: false });
            expect(s.isAborted).toBe(false);
        });

        it('TERMINATE aborts, clears streaming/buffers/names, and rolls back to preRunMessageCount', () => {
            const seeded: AgentState = {
                ...initialAgentState,
                messages: [userMsg('a'), userMsg('b'), userMsg('c')],
                preRunMessageCount: 1,
                streamingText: 'partial',
                streamingMessageId: 'm1',
                toolCallBuffers: new Map([['tc1', { name: 'fn', argsBuffer: '' }]]),
                toolCallIdToName: new Map([['tc1', 'fn']]),
            };
            const s = agentReducer(seeded, { type: 'TERMINATE' });
            expect(s.isAborted).toBe(true);
            expect(s.messages).toHaveLength(1);
            expect(s.streamingText).toBe('');
            expect(s.streamingMessageId).toBeNull();
            expect(s.toolCallBuffers.size).toBe(0);
            expect(s.toolCallIdToName.size).toBe(0);
        });
    });

    describe('SNAPSHOT_PRE_RUN', () => {
        it('captures (messages.length - 1) and clears streaming', () => {
            const seeded: AgentState = {
                ...initialAgentState,
                messages: [userMsg('a'), userMsg('b'), userMsg('c')],
                streamingText: 'leftover',
                streamingMessageId: 'm1',
            };
            const s = agentReducer(seeded, { type: 'SNAPSHOT_PRE_RUN' });
            expect(s.preRunMessageCount).toBe(2);
            expect(s.streamingText).toBe('');
            expect(s.streamingMessageId).toBeNull();
        });

        it('floors at zero when messages is empty', () => {
            const s = agentReducer(initialAgentState, { type: 'SNAPSHOT_PRE_RUN' });
            expect(s.preRunMessageCount).toBe(0);
        });
    });

    describe('global state', () => {
        it('UPDATE_TOOL_STATE sets a single key', () => {
            const s = agentReducer(initialAgentState, { type: 'UPDATE_TOOL_STATE', toolName: 'foo', data: { x: 1 } });
            expect(s.globalState).toEqual({ foo: { x: 1 } });
        });

        it('PATCH_GLOBAL_STATE merges multiple keys', () => {
            const seeded: AgentState = { ...initialAgentState, globalState: { a: 1 } };
            const s = agentReducer(seeded, { type: 'PATCH_GLOBAL_STATE', patch: { b: 2, c: 3 } });
            expect(s.globalState).toEqual({ a: 1, b: 2, c: 3 });
        });

        it('MERGE_STATE_SNAPSHOT preserves _-prefixed frontend-managed keys', () => {
            const seeded: AgentState = {
                ...initialAgentState,
                globalState: {
                    _soco_accumulated_outlines: ['a', 'b'],
                    backend_key: 'old',
                },
            };
            const s = agentReducer(seeded, {
                type: 'MERGE_STATE_SNAPSHOT',
                snapshot: {
                    backend_key: 'new',
                    _soco_accumulated_outlines: 'SHOULD_NOT_OVERWRITE',
                    other: 42,
                },
            });
            expect(s.globalState._soco_accumulated_outlines).toEqual(['a', 'b']);
            expect(s.globalState.backend_key).toBe('new');
            expect(s.globalState.other).toBe(42);
        });
    });

    describe('message ops', () => {
        it('ADD_MESSAGE appends immutably', () => {
            const seeded: AgentState = { ...initialAgentState, messages: [userMsg('hi')] };
            const s = agentReducer(seeded, { type: 'ADD_MESSAGE', message: userMsg('bye') });
            expect(s.messages).toHaveLength(2);
            expect(seeded.messages).toHaveLength(1); // original untouched
        });

        it('SET_MESSAGES replaces the list', () => {
            const seeded: AgentState = { ...initialAgentState, messages: [userMsg('a')] };
            const s = agentReducer(seeded, { type: 'SET_MESSAGES', messages: [userMsg('x'), userMsg('y')] });
            expect(s.messages.map(m => m.content)).toEqual(['x', 'y']);
        });

        it('CLEAR_MESSAGES empties the list', () => {
            const seeded: AgentState = { ...initialAgentState, messages: [userMsg('a')] };
            const s = agentReducer(seeded, { type: 'CLEAR_MESSAGES' });
            expect(s.messages).toEqual([]);
        });
    });
});
