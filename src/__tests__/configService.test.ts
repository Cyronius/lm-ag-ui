import { describe, it, expect, vi } from 'vitest';
import { loadAgentConfig } from '../configService';

const mockConfigResponse = {
    tools: [
        { name: 'test_tool', displayName: 'Test Tool', description: 'A test', isFrontend: true }
    ],
    suggestions: [
        { suggestion: 'Hello', isPriority: true },
        { suggestion: 'Help me' }
    ],
    config: { key1: 'value1' }
};

function mockFetch(body: any, status = 200): typeof fetch {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
        headers: new Headers({ 'content-type': 'application/json' })
    }) as unknown as typeof fetch;
}

describe('loadAgentConfig', () => {
    it('loads config successfully', async () => {
        const fetchFn = mockFetch(mockConfigResponse);
        const config = await loadAgentConfig('http://localhost:8000', 'test-agent', undefined, fetchFn);

        expect(config.suggestions).toHaveLength(2);
        expect(config.suggestions[0]).toEqual({ suggestion: 'Hello', isPriority: true });
        expect(config.suggestions[1]).toEqual({ suggestion: 'Help me', isPriority: false });
        expect(config.toolConfigs).toHaveLength(1);
        expect(config.toolConfigs![0].name).toBe('test_tool');
        expect(config.config).toEqual({ key1: 'value1' });
    });

    it('calls the correct URL', async () => {
        const fetchFn = mockFetch(mockConfigResponse);
        await loadAgentConfig('http://example.com', 'my-agent', undefined, fetchFn);

        expect(fetchFn).toHaveBeenCalledWith(
            'http://example.com/agent/my-agent',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('includes auth header when tokenProvider is set', async () => {
        const fetchFn = mockFetch(mockConfigResponse);
        const tokenProvider = vi.fn().mockResolvedValue('my-token');

        await loadAgentConfig('http://localhost:8000', 'test-agent', tokenProvider, fetchFn);

        expect(fetchFn).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer my-token'
                })
            })
        );
    });

    it('throws on 4xx error with detail', async () => {
        const fetchFn = mockFetch({ detail: 'Not found' }, 404);
        await expect(
            loadAgentConfig('http://localhost:8000', 'bad-agent', undefined, fetchFn)
        ).rejects.toThrow("Failed to load configuration for agent 'bad-agent' (HTTP 404)");
    });

    it('throws on 5xx error with server message', async () => {
        const fetchFn = mockFetch('Internal error', 500);
        await expect(
            loadAgentConfig('http://localhost:8000', 'test-agent', undefined, fetchFn)
        ).rejects.toThrow('Failed to load agent from backend server (HTTP 500)');
    });

    it('times out when fetch takes too long', async () => {
        const slowFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            return new Promise((resolve, reject) => {
                const onAbort = () => {
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                };
                if (init?.signal?.aborted) {
                    onAbort();
                    return;
                }
                init?.signal?.addEventListener('abort', onAbort);
            });
        }) as unknown as typeof fetch;

        await expect(
            loadAgentConfig('http://localhost:8000', 'test-agent', undefined, slowFetch, 50)
        ).rejects.toThrow("Config loading timed out after 50ms for agent 'test-agent'");
    });

    it('defaults empty config to empty object', async () => {
        const noConfig = { ...mockConfigResponse, config: undefined };
        const fetchFn = mockFetch(noConfig);
        const config = await loadAgentConfig('http://localhost:8000', 'test-agent', undefined, fetchFn);
        expect(config.config).toEqual({});
    });
});
