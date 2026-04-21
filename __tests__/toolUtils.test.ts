import { describe, it, expect } from 'vitest';
import {
    getAllToolDefinitions,
    getFrontendToolDefinitions,
    getBackendToolDefinitions,
    getFrontEndTools,
    getToolRenderers
} from '../toolUtils';
import type { ToolDefinition } from '../index';

function makeTool(name: string, isFrontend: boolean, hasRenderer = false): ToolDefinition {
    return {
        definition: {
            name,
            description: `${name} tool`,
            parameters: { type: 'object', properties: {}, required: [] }
        },
        isFrontend,
        handler: isFrontend ? () => '{}' : undefined,
        renderer: hasRenderer ? () => undefined : undefined,
    };
}

const tools: Record<string, ToolDefinition> = {
    frontendA: makeTool('frontendA', true, true),
    frontendB: makeTool('frontendB', true, false),
    backendA: makeTool('backendA', false, true),
    backendB: makeTool('backendB', false, false),
};

describe('getAllToolDefinitions', () => {
    it('returns definitions for all tools', () => {
        const defs = getAllToolDefinitions(tools);
        expect(defs).toHaveLength(4);
        expect(defs.map(d => d.name)).toEqual(['frontendA', 'frontendB', 'backendA', 'backendB']);
    });

    it('returns empty array for empty tools', () => {
        expect(getAllToolDefinitions({})).toEqual([]);
    });
});

describe('getFrontendToolDefinitions', () => {
    it('returns only frontend tool definitions', () => {
        const defs = getFrontendToolDefinitions(tools);
        expect(defs).toHaveLength(2);
        expect(defs.map(d => d.name)).toEqual(['frontendA', 'frontendB']);
    });
});

describe('getBackendToolDefinitions', () => {
    it('returns only backend tool definitions', () => {
        const defs = getBackendToolDefinitions(tools);
        expect(defs).toHaveLength(2);
        expect(defs.map(d => d.name)).toEqual(['backendA', 'backendB']);
    });
});

describe('getFrontEndTools', () => {
    it('returns record of only frontend tools', () => {
        const result = getFrontEndTools(tools);
        expect(Object.keys(result)).toEqual(['frontendA', 'frontendB']);
        expect(result['frontendA'].isFrontend).toBe(true);
    });

    it('returns empty record when no frontend tools', () => {
        const backendOnly = { backendA: tools['backendA'] };
        expect(Object.keys(getFrontEndTools(backendOnly))).toEqual([]);
    });
});

describe('getToolRenderers', () => {
    it('returns renderers for tools that have them', () => {
        const renderers = getToolRenderers(tools);
        expect(Object.keys(renderers)).toEqual(['frontendA', 'backendA']);
    });

    it('returns empty record when no tools have renderers', () => {
        const noRenderers = { frontendB: tools['frontendB'], backendB: tools['backendB'] };
        expect(Object.keys(getToolRenderers(noRenderers))).toEqual([]);
    });
});
