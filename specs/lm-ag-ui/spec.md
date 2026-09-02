# lm-ag-ui — canonical spec

Home repo: `TechSavvies/lm-ag-ui`. Requirement prefix: `AGUI`.

This spec was started on 2026-09-02 alongside the 2.0 release. It covers the
behaviours changed or added by that release. The remaining ~150 tests in
`src/__tests__/` predate it and are traced incrementally — a behaviour is
added here when it is touched, not retro-fitted in bulk.

Tests for requirements in this file live in `specs/lm-ag-ui/tests/` unless an
entry says otherwise.

## Message history

### AGUI-TOOL-RESULT-ADJACENCY: tool results stay adjacent to their owning assistant message
**Applies to:** lm-ag-ui
**Test category:** unit

After a run finishes, every `role: 'tool'` message in the store's history shall
be immediately preceded by the `assistant` message whose `toolCalls` contains
its `toolCallId` (or by another `tool` message owned by that same assistant
message). This holds when `suppressIntermediateAssistantMessages` is on and a
backend tool's result arrives in-run followed by trailing assistant text: the
trailing text is committed *after* the owning assistant message is assembled,
never between it and the tool result.

Rationale: OpenAI-compatible providers reject a history where a `tool` message
has no adjacent owner; the backend's adjacency sanitizer drops the orphan, and
the agent loses the tool's output on the next turn (observed live in lm-admin
`mobi_cbiv`, 2026-09-01).

**Acceptance criteria:**
- Events `text(empty) → toolStart(call_1, backend) → toolResult(call_1) → text("Would you like…") → runFinished`, with suppression on → history is `user, assistant(toolCalls=[call_1]), tool(call_1), assistant("Would you like…")`.
- Same sequence with a live first segment `text("Looking…")` before the tool call → `user, assistant("Looking…", toolCalls=[call_1]), tool(call_1), assistant("Would you like…")`.
- Same sequence with suppression off → same ordering (the suppressor is not what guarantees adjacency).

### AGUI-BEGIN-TURN: `beginTurn` starts a fresh user turn
**Applies to:** lm-ag-ui
**Test category:** unit
**External tests:** `src/__tests__/agentStore.test.ts` ("beginTurn" cases)

Consumers that call `agentClient.runAgent` directly shall start the turn with
`beginTurn()` rather than `agentClient.startNewRun()`. `beginTurn` clears any
stale chained-run marker (so `suppressIntermediateAssistantMessages` treats the
next run as fresh), resets the chained-tool-turn counter, and mints the run.

**Acceptance criteria:**
- After a tool chain that never completed, `beginTurn()` then a run whose first text is `"Hi"` → `"Hi"` streams live (not buffered).
- `startNewRun()` alone in the same situation → `"Hi"` is buffered (contrast case).

## Agentic chains

### AGUI-SUPPRESS-INTERMEDIATE: intermediate narration suppression
**Applies to:** lm-ag-ui
**Test category:** unit
**External tests:** `src/__tests__/intermediateMessageSuppressor.test.ts`, `src/__tests__/agentStore.test.ts`

When `suppressIntermediateAssistantMessages` is true, within one user turn only
the first text segment streams live and only the final run's text is committed;
text emitted by an intermediate run (one that chains another frontend tool
call) is dropped. Backend tool results do not count as chaining. The flag is
frontend-local and never sent to the backend.

**Acceptance criteria:**
- Run 1 text `"A"` (live), frontend tool call, run 2 text `"B"` + another tool call, run 3 text `"C"` → history contains `"A"` and `"C"`, not `"B"`.
- Run with backend tool result + trailing text → trailing text is committed (see AGUI-TOOL-RESULT-ADJACENCY for its position).

### AGUI-MAX-TOOL-TURNS: cap on chained frontend-tool continuations
**Applies to:** lm-ag-ui
**Test category:** unit

The store shall stop submitting frontend tool results after `maxToolTurns`
(default 8) chained continuations within one user turn. On breach: no
submission is made, `hasPendingToolWork` clears, an assistant error message is
added, and `onError` fires with `code: 'max_tool_turns'`. The counter resets on
`beginTurn()`, on a fresh (non-chained) `RunStarted`, and on `RunError`.

**Acceptance criteria:**
- `maxToolTurns: 2`, agent requests a frontend tool on every run → exactly 2 `submitToolResults` calls, then an assistant message matching `/Stopped after 2 chained tool turns/` and `onError({ code: 'max_tool_turns' })`.
- Same setup, agent answers with text on run 3 → 2 submissions, no error.
- After the cap trips, `beginTurn()` and a new chain → submissions resume from 0.

## Events

### AGUI-CUSTOM-EVENT-LISTENER: consumers can observe AG-UI CUSTOM events
**Applies to:** lm-ag-ui
**Test category:** unit

`useAgent`, `useAgentSetup`, and `AgentStore` shall accept an `onCustomEvent`
option that is called with the event payload (`name`, `value`) for every AG-UI
`CUSTOM` event received. The library does not interpret custom events.
Consumers must not need to mutate the subscriber object to observe them.

**Acceptance criteria:**
- `onCustomEvent` option set; store receives `CUSTOM { name: 'toolLibrary.activeCategories', value: { active: ['a'] } }` → callback invoked once with that event.
- Option updated via `setOptions` → the new callback is used for subsequent events.
- No option set → event is ignored without error.
