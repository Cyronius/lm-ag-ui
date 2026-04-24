import { StandardTool, ToolDefinition, ToolRenderer, ToolConfigResponse } from './index';


// Helper functions
export function getAllToolDefinitions(tools: Record<string, ToolDefinition>): StandardTool[] {
    return Object.values(tools).map(tool => tool.definition);
}

export function getFrontendToolDefinitions(tools: Record<string, ToolDefinition>): StandardTool[] {
    return Object.values(tools)
        .filter(tool => tool.isFrontend)
        .map(tool => tool.definition);
}

export function getBackendToolDefinitions(tools: Record<string, ToolDefinition>): StandardTool[] {
    return Object.values(tools)
        .filter(tool => !tool.isFrontend)
        .map(tool => tool.definition);
}

export function getFrontEndTools(tools: Record<string, ToolDefinition>): Record<string, ToolDefinition> {
    const frontEndTools: Record<string, ToolDefinition> = {};
    Object.entries(tools).forEach(([name, tool]) => {
        if (tool.isFrontend) {
            frontEndTools[name] = tool;
        }
    });
    return frontEndTools;
}

/**
 * Merge backend tool configs with frontend-supplied handlers/renderers/onResult.
 *
 * The backend owns the schema and configJson; the frontend owns the code that runs
 * handlers and renders results. This helper joins them by tool name, producing a
 * full ToolDefinition map ready to pass into useAgent.
 *
 * Behavior:
 *  - Backend-only tools (no matching frontend entry) are treated as backend tools
 *    (isFrontend defaults to false), with no handler.
 *  - Frontend-only tools (no matching backend entry) are skipped — the backend
 *    must know about a tool for the agent to invoke it.
 *  - When both sides supply isFrontend, the frontend entry wins (callers who
 *    provide a handler generally mean to run locally).
 */
export function hydrateToolConfigs(
    backendConfigs: ToolConfigResponse[] | undefined,
    frontendTools: Record<string, Partial<ToolDefinition>>
): Record<string, ToolDefinition> {
    const out: Record<string, ToolDefinition> = {};
    if (!backendConfigs) return out;

    for (const cfg of backendConfigs) {
        const front = frontendTools[cfg.name] ?? {};
        const definition: StandardTool = {
            name: cfg.name,
            description: cfg.description ?? '',
            parameters: (cfg.parameters as StandardTool['parameters']) ?? {
                type: 'object',
                properties: {},
                required: [],
            },
        };
        out[cfg.name] = {
            definition,
            handler: front.handler,
            renderer: front.renderer,
            onResult: front.onResult,
            isFrontend: front.isFrontend ?? cfg.isFrontend ?? false,
            configJson: front.configJson ?? cfg.configJson,
        };
    }
    return out;
}

export function getToolRenderers(tools: Record<string, ToolDefinition>): Record<string, ToolRenderer> {
    const renderers: Record<string, ToolRenderer> = {};
    Object.entries(tools).forEach(([name, tool]) => {
        if (tool.renderer) {
            renderers[name] = tool.renderer;
        }
    });
    return renderers;
}