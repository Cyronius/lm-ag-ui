import { AgentConfig, Suggestion, ToolConfigResponse } from './index';
import type { TokenProvider } from './AgentClient';

/**
 * Configuration Loading Service
 *
 * Loads agent configuration from the backend API.
 *
 * Throws an error if config fails to load from backend.
 */

/**
 * Server response format for agent configuration
 */
interface AgentConfigResponse {
	tools: ToolConfigResponse[];
	suggestions: Array<{
		suggestion: string;
		isPriority?: boolean;
	}>;
	config?: Record<string, string | null>;  // Agent config key-value pairs
}

/**
 * Load agent configuration based on agentId
 *
 * @param baseUrl - The base URL of the backend server
 * @param agentId - The agent identifier
 * @returns Promise<AgentConfig> - Resolves with config or throws error
 * @throws Error if config fetch fails
 */
export async function loadAgentConfig(baseUrl: string, agentId: string, tokenProvider?: TokenProvider): Promise<AgentConfig> {

	const configUrl = `${baseUrl}/agent/${agentId}`;

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (tokenProvider) {
		const token = await tokenProvider();
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}
	}

	const response = await fetch(configUrl, {
		method: 'GET',
		headers
	});

	if (!response.ok) {
		// Try to get error details from response body
		let errorDetail = '';
		try {
			const errorBody = await response.text();
			if (errorBody) {
				errorDetail = `: ${errorBody}`;
			}
		} catch {
			// Ignore parse errors
		}

		const errorMessage = response.status >= 500
			? `Failed to load agent from backend server (HTTP ${response.status})${errorDetail}`
			: `Failed to load configuration for agent '${agentId}' (HTTP ${response.status})${errorDetail}`;

		console.error(`[ConfigService] ${errorMessage}`);
		throw new Error(errorMessage);
	}

		const serverConfig: AgentConfigResponse = await response.json();

	// Normalize suggestions to handle both snake_case and camelCase
	const suggestions: Suggestion[] = serverConfig.suggestions.map(s => ({
		suggestion: s.suggestion,
		isPriority: s.isPriority ?? false
	}));

	// Return raw toolConfigs - they will be processed by createSmarketingTools
	return {
		toolConfigs: serverConfig.tools,
		suggestions,
		config: serverConfig.config || {}
	};
}
