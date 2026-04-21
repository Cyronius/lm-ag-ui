import { describe, it, expect } from 'vitest';
import { AgentClient } from '../AgentClient';

describe('AgentClient constructor validation', () => {
    it('throws when agentId is empty', () => {
        expect(() => new AgentClient('http://localhost:8000', ''))
            .toThrow('agentId is required and cannot be empty');
    });

    it('throws when agentId is whitespace only', () => {
        expect(() => new AgentClient('http://localhost:8000', '   '))
            .toThrow('agentId is required and cannot be empty');
    });

    it('throws when baseUrl is empty', () => {
        expect(() => new AgentClient('', 'test-agent'))
            .toThrow('baseUrl is required and cannot be empty');
    });

    it('throws when timeout is negative', () => {
        expect(() => new AgentClient('http://localhost:8000', 'test-agent', { timeout: -1 }))
            .toThrow('timeout must be a positive number');
    });

    it('throws when timeout is zero', () => {
        expect(() => new AgentClient('http://localhost:8000', 'test-agent', { timeout: 0 }))
            .toThrow('timeout must be a positive number');
    });

    it('creates successfully with valid params', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        expect(client).toBeDefined();
    });

    it('creates successfully with custom timeout', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent', { timeout: 60000 });
        expect(client.getConfig().timeout).toBe(60000);
    });

    it('uses default timeout when not specified', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        expect(client.getConfig().timeout).toBe(300000);
    });
});

describe('AgentClient session management', () => {
    it('starts with inactive session and no IDs', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        const session = client.session;
        expect(session.threadId).toBeNull();
        expect(session.runId).toBeNull();
        expect(session.isActive).toBe(false);
    });

    it('startNewRun creates threadId and runId', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        const session = client.startNewRun();
        expect(session.threadId).toBeTruthy();
        expect(session.runId).toBeTruthy();
        expect(session.isActive).toBe(true);
    });

    it('startNewRun preserves existing threadId', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        const first = client.startNewRun();
        client.endRun();
        const second = client.startNewRun();
        expect(second.threadId).toBe(first.threadId);
        expect(second.runId).not.toBe(first.runId);
    });

    it('endRun clears runId and sets inactive', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        client.startNewRun();
        client.endRun();
        const session = client.session;
        expect(session.runId).toBeNull();
        expect(session.isActive).toBe(false);
        expect(session.threadId).toBeTruthy(); // threadId preserved
    });

    it('endSession clears everything', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        client.startNewRun();
        client.endSession();
        const session = client.session;
        expect(session.threadId).toBeNull();
        expect(session.runId).toBeNull();
        expect(session.isActive).toBe(false);
    });

    it('uses initialThreadId when provided', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent', {
            initialThreadId: 'my-thread-123'
        });
        expect(client.session.threadId).toBe('my-thread-123');
    });

    it('session getter returns a copy (not reference)', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        const s1 = client.session;
        const s2 = client.session;
        expect(s1).toEqual(s2);
        expect(s1).not.toBe(s2);
    });
});

describe('AgentClient debug mode', () => {
    it('defaults to false', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        expect(client.debug).toBe(false);
    });

    it('can be toggled', () => {
        const client = new AgentClient('http://localhost:8000', 'test-agent');
        client.setDebug(true);
        expect(client.debug).toBe(true);
        client.setDebug(false);
        expect(client.debug).toBe(false);
    });
});

describe('AgentClient getConfig', () => {
    it('returns baseUrl, agentId, and timeout', () => {
        const client = new AgentClient('http://example.com', 'my-agent', { timeout: 5000 });
        expect(client.getConfig()).toEqual({
            baseUrl: 'http://example.com',
            agentId: 'my-agent',
            timeout: 5000
        });
    });
});
