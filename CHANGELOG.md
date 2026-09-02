# Changelog

## 2.0.0 (unreleased)

Package renamed to `@techsavvies/lm-ag-ui`; repo moved to `github.com/TechSavvies/lm-ag-ui`. This supersedes both `@cyronius/lm-ag-ui` (npmjs) and `@itkennel/lm-ag-ui` (Azure Artifacts feed, built from the `smarketing` repo — its source was identical to 1.1.0).

### Breaking
- `useAgentSession`, `useAgentStream`, `useFrontendToolRunner` and their types are removed. The React-free `AgentStore` replaces the hook composition; `useAgent` / `useAgentSetup` / `AgentClientContextValue` are signature-compatible.
- `agentSubscriber` on the context value is now the `AgentStore` instance. Do not assign handler keys onto it — use the `onCustomEvent` option instead.

### Added
- `AgentStore` — React-free engine implementing `AgentSubscriber`, exposed via the `./core` subpath.
- `beginTurn()` — fresh-turn entry point for consumers calling `agentClient.runAgent` directly (AGUI-BEGIN-TURN).
- `onCustomEvent` option on `useAgent` / `useAgentSetup` / `AgentStore` (AGUI-CUSTOM-EVENT-LISTENER).
- `maxToolTurns` option (default 8) capping chained frontend-tool continuations per user turn; `onError` gains `code: 'max_tool_turns'` (AGUI-MAX-TOOL-TURNS).
- `onError` is now accepted by `useAgentSetup` (previously only `useAgent`).
- `specs/lm-ag-ui/spec.md` — canonical requirements with IDs; new tests live under `specs/lm-ag-ui/tests/`.
- CI runs `tsc --noEmit` and eslint.

### Fixed
- A backend tool result followed by trailing assistant text (with `suppressIntermediateAssistantMessages` on) produced `tool → assistant(text) → assistant(toolCalls)`, orphaning the tool result on the next full-history send. History is now `assistant(toolCalls) → tool → assistant(text)` (AGUI-TOOL-RESULT-ADJACENCY).
- `isBusy` / `hasPendingToolWork` reset when a chained run errors, times out, is terminated, or has nothing submittable.
- `useAgentSetup`'s `AgentLayer` no longer remounts on option identity churn; only `baseUrl` / `agentId` changes remount. A rotated `tokenProvider` applies without a remount.
- Type errors from the duplicated `rxjs` copy under `@ag-ui/client` (dev dependency pinned to 7.8.1).

## 1.1.0 — 2026-07-27

First standalone release on npmjs as `@cyronius/lm-ag-ui`. Same source as `@itkennel/lm-ag-ui@1.0.276` on the Azure feed.
