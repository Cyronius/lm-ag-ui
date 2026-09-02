// Package root (`@techsavvies/lm-ag-ui`): the React entry point.
//
// Re-exports everything from `./core` (the React-free engine — also available
// standalone as `@techsavvies/lm-ag-ui/core` for non-React consumers) and adds
// the React bindings: useAgent, useAgentSetup, AgentProvider, useAgentContext.

export * from './core';

export { AgentProvider, useAgentContext } from './AgentClientContext';
export { useAgent } from './useAgent';
export { useAgentSetup } from './useAgentSetup';
export type { UseAgentSetupOptions, UseAgentSetupResult } from './useAgentSetup';
