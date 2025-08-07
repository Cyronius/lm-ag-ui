import { StandardTool, ToolDefinition, ToolHandler, ToolRenderer } from '../types/index';


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

export function getToolRenderers(tools: Record<string, ToolDefinition>): Record<string, ToolRenderer> {
    const renderers: Record<string, ToolRenderer> = {};
    Object.entries(tools).forEach(([name, tool]) => {
        if (tool.renderer) {
            renderers[name] = tool.renderer;
        }
    });
    return renderers;
}