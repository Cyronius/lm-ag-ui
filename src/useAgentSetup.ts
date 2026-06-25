import React, { useState, useEffect, useMemo } from 'react';
import { AgentConfig, UseAgentOptions, AgentClientContextValue, ToolDefinition } from './index';
import { loadAgentConfig } from './configService';
import { useAgent } from './useAgent';
import { AgentProvider } from './AgentClientContext';
import { hydrateToolConfigs } from './toolUtils';

export interface UseAgentSetupOptions {
    baseUrl?: string;
    agentId: string;
    tokenProvider?: UseAgentOptions['tokenProvider'];
    requestHandler?: UseAgentOptions['requestHandler'];
    timeout?: number;
    /**
     * Safety timeout in ms forwarded to the underlying agent run. After this
     * elapses with an active run, the run is forcibly aborted and a timeout
     * message is added. See `UseAgentOptions.safetyTimeoutMs`. Default: 300_000.
     */
    safetyTimeoutMs?: UseAgentOptions['safetyTimeoutMs'];
    tools?: UseAgentOptions['tools'];
    buildForwardedProps?: UseAgentOptions['buildForwardedProps'];
    systemContextBuilder?: UseAgentOptions['systemContextBuilder'];
    debug?: boolean;
    /**
     * When true, runAgent ships the full caller-provided messages array on every
     * call (frontend-controlled history). When false (default), only the newest
     * turn is sent and the backend rehydrates prior history from threadId.
     * Must match the backend contract — see AgentClient.submitToolResults docs.
     */
    sendFullHistory?: boolean;
    /**
     * Optional outbound-message transformer applied by AgentClient on every wire send
     * (runAgent + submitToolResults). See AgentClientOptions.pruneOutboundMessages.
     */
    pruneOutboundMessages?: UseAgentOptions['pruneOutboundMessages'];
    /**
     * When true, suppress intermediate assistant narration during an agentic
     * chain. See `UseAgentOptions.suppressIntermediateAssistantMessages` for full
     * semantics. Sticky for the lifetime of the AgentLayer.
     */
    suppressIntermediateAssistantMessages?: UseAgentOptions['suppressIntermediateAssistantMessages'];
    /**
     * Optional frontend tool implementations keyed by tool name. When provided,
     * backend tool configs are automatically joined with these implementations via
     * `hydrateToolConfigs`, and the result is assigned to `config.tools` before
     * `onConfigLoaded` runs. Use this for the common case where you just want to
     * attach handlers to backend-declared tools without writing a custom merge.
     *
     * If you need full control (e.g., conditional tool registration), omit this
     * and use `onConfigLoaded` to build `tools` yourself.
     */
    frontendToolImpls?: Record<string, Partial<ToolDefinition>>;
    /** Called after config loads from the backend. Use this to transform toolConfigs into tools, extract settings, etc. */
    onConfigLoaded?: (config: AgentConfig) => AgentConfig;
    /**
     * Optional extra query params appended to the config-init GET
     * (`GET /agent/{agentId}`). Array values are sent as repeated keys
     * (`?kbIds=a&kbIds=b`). Read when config loads; pass a stable reference
     * (memoized object) — a new identity per render re-triggers the config
     * fetch, like tokenProvider/requestHandler.
     */
    configParams?: Record<string, string | string[]>;
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
    requestHandler,
    timeout,
    safetyTimeoutMs,
    tools,
    buildForwardedProps,
    systemContextBuilder,
    debug,
    sendFullHistory,
    pruneOutboundMessages,
    suppressIntermediateAssistantMessages,
    frontendToolImpls,
    onConfigLoaded,
    configParams
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

        loadAgentConfig(baseUrl!, agentId, tokenProvider, requestHandler, undefined, configParams)
            .then(loadedConfig => {
                if (cancelled) return;
                // Auto-hydrate tools from backend configs + caller-supplied frontend impls,
                // unless the caller already set tools (e.g., from a previous onConfigLoaded run).
                if (frontendToolImpls && !loadedConfig.tools) {
                    loadedConfig.tools = hydrateToolConfigs(loadedConfig.toolConfigs, frontendToolImpls);
                }
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
    }, [isReady, baseUrl, agentId, tokenProvider, requestHandler, configParams]);

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
            requestHandler,
            timeout,
            safetyTimeoutMs,
            tools: tools ?? config.tools ?? {},
            buildForwardedProps,
            systemContextBuilder,
            debug,
            sendFullHistory,
            pruneOutboundMessages,
            suppressIntermediateAssistantMessages,
            configParams,
        };

        // This is a new component — useAgent's useState initializer runs fresh
        // with the correct baseUrl/agentId when this mounts.
        const Layer = ({ children }: { children: React.ReactNode }) => {
            const agent = useAgent(agentOptions);
            return React.createElement(AgentProvider, { value: agent, children });
        };
        Layer.displayName = 'AgentLayer';
        return Layer;
    }, [config, baseUrl, agentId, tokenProvider, requestHandler, timeout, safetyTimeoutMs, tools, buildForwardedProps, systemContextBuilder, debug, sendFullHistory, pruneOutboundMessages, suppressIntermediateAssistantMessages, configParams]);

    return { config, isLoading, error, AgentLayer };
}
