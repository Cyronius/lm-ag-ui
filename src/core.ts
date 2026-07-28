// React-free entry point (`@cyronius/lm-ag-ui/core`).
//
// Everything exported here runs without React installed: AgentStore is the
// full event pipeline (AG-UI subscriber → reducer → frontend tool runner) and
// exposes subscribe/getSnapshot — the useSyncExternalStore contract, equally
// usable from Vue, Svelte, a worker, or plain TypeScript. See
// examples/plain-typescript for a complete console consumer.
//
// The only React trace is type-level: ToolDefinition.renderer returns a
// ReactElement. Type imports are erased at build time, so no `react` package
// is needed at runtime; non-React consumers simply leave `renderer` unset.

export * from './types';

export { AgentClient } from './AgentClient';
export type { TokenProvider, SystemContextBuilder } from './AgentClient';
export type { RequestHandler } from './CustomHttpAgent';

export { AgentStore } from './AgentStore';
export type { AgentStoreOptions, AgentSnapshot, RunFinishedPayload, PendingToolCall } from './AgentStore';

export { agentReducer, initialAgentState } from './agentReducer';
export type { AgentState, AgentAction, ToolCallBuffer } from './agentReducer';

export { executeFrontendToolCall } from './frontendToolExecution';
export type { FrontendToolExecution } from './frontendToolExecution';

export { filesToBinaryContent } from './fileUtils';
export { getAllToolDefinitions, getFrontendToolDefinitions, getBackendToolDefinitions, getFrontEndTools, getToolRenderers, hydrateToolConfigs } from './toolUtils';
export { loadAgentConfig } from './configService';
export { groupSuggestionsByCategory, SUGGESTION_CATEGORY_SEPARATOR } from './suggestionUtils';
export type { SuggestionGroup, CategorizedSuggestion } from './suggestionUtils';
