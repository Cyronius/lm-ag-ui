import React, { useState, useEffect, useMemo } from 'react';
import { AgentConfig, UseAgentOptions, AgentClientContextValue } from './index';
import { loadAgentConfig } from './configService';
import { useAgent } from './useAgent';
import { AgentProvider } from './AgentClientContext';

export interface UseAgentSetupOptions {
    baseUrl?: string;
    agentId: string;
    tokenProvider?: UseAgentOptions['tokenProvider'];
    timeout?: number;
    tools?: UseAgentOptions['tools'];
    buildForwardedProps?: UseAgentOptions['buildForwardedProps'];
    /** Called after config loads from the backend. Use this to transform toolConfigs into tools, extract settings, etc. */
    onConfigLoaded?: (config: AgentConfig) => AgentConfig;
}

export interface UseAgentSetupResult {
    config: AgentConfig | null;
    isLoading: boolean;
    error: Error | null;
    /** Wrapper component — renders AgentProvider only when config is loaded. Passthrough otherwise. */
    AgentLayer: React.FC<{ children: React.ReactNode }>;
}

/**
 * Combined hook that handles async config loading + useAgent initialization.
 *
 * Solves the problem where useAgent captures baseUrl/agentId in a useState
 * initializer (once), so calling it before config is ready creates a broken client.
 *
 * The returned AgentLayer component conditionally mounts useAgent only after
 * config has loaded, ensuring AgentClient is created with valid values.
 */
export function useAgentSetup({
    baseUrl,
    agentId,
    tokenProvider,
    timeout,
    tools,
    buildForwardedProps,
    onConfigLoaded
}: UseAgentSetupOptions): UseAgentSetupResult {
    const [config, setConfig] = useState<AgentConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const isReady = !!baseUrl && !!agentId;

    useEffect(() => {
        if (!isReady) return;
        let cancelled = false;
        setIsLoading(true);
        setError(null);

        loadAgentConfig(baseUrl!, agentId)
            .then(loadedConfig => {
                if (cancelled) return;
                const finalConfig = onConfigLoaded
                    ? onConfigLoaded(loadedConfig)
                    : loadedConfig;
                setConfig(finalConfig);
            })
            .catch(err => {
                if (!cancelled) setError(err);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [isReady, baseUrl, agentId]);

    // Build the AgentLayer component.
    // When config is null, it's a passthrough (children render without AgentProvider).
    // When config loads, a new component identity is created that mounts useAgent fresh.
    const AgentLayer = useMemo(() => {
        if (!config || !baseUrl) {
            return ({ children }: { children: React.ReactNode }) =>
                React.createElement(React.Fragment, null, children);
        }

        const agentOptions: UseAgentOptions = {
            baseUrl,
            agentId,
            tokenProvider,
            timeout,
            tools: tools ?? config.tools ?? {},
            buildForwardedProps
        };

        // This is a new component — useAgent's useState initializer runs fresh
        // with the correct baseUrl/agentId when this mounts.
        const Layer = ({ children }: { children: React.ReactNode }) => {
            const agent = useAgent(agentOptions);
            return React.createElement(AgentProvider, { value: agent, children });
        };
        Layer.displayName = 'AgentLayer';
        return Layer;
    }, [config, baseUrl, agentId, tokenProvider, timeout, tools, buildForwardedProps]);

    return { config, isLoading, error, AgentLayer };
}
