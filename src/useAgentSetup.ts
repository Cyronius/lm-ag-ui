import React, { useState, useEffect, useMemo, useRef } from 'react';
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
     * Absolute hard cap in ms for a whole run, forwarded to the underlying agent
     * run. Never reset. On expiry the run is forcibly aborted and a timeout message
     * is added. See `UseAgentOptions.safetyTimeoutMs`. Default: 900_000 (15 min).
     */
    safetyTimeoutMs?: UseAgentOptions['safetyTimeoutMs'];
    /**
     * Idle window in ms, forwarded to the underlying agent run. Reset on every
     * AG-UI event, so only a genuine stall trips it. See
     * `UseAgentOptions.idleTimeoutMs`. Default: 180_000 (3 min).
     */
    idleTimeoutMs?: UseAgentOptions['idleTimeoutMs'];
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
    idleTimeoutMs,
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

    // Latest agent options, rebuilt every render and read by AgentLayer at its
    // OWN render time. This keeps option identity churn (an unmemoized `tools`
    // object, an inline `buildForwardedProps`, a config refetch replacing the
    // config object) from changing the Layer's component identity — a new
    // component type unmounts the whole agent subtree and silently discards
    // the conversation. useAgent pushes all mutable options into the store on
    // every render, so per-render churn here is harmless. Construction-frozen
    // transport options (requestHandler, sendFullHistory, initialThreadId,
    // systemContextBuilder, pruneOutboundMessages, configParams, debug) are
    // read once at mount; changing them requires a remount by design.
    // `tokenProvider` is the exception: useAgent forwards the latest one to
    // the client on every render (AgentClient.setTokenProvider).
    const agentOptionsRef = useRef<UseAgentOptions | null>(null);
    agentOptionsRef.current = config && baseUrl ? {
        baseUrl,
        agentId,
        tokenProvider,
        requestHandler,
        timeout,
        safetyTimeoutMs,
        idleTimeoutMs,
        tools: tools ?? config.tools ?? {},
        buildForwardedProps,
        systemContextBuilder,
        debug,
        sendFullHistory,
        pruneOutboundMessages,
        suppressIntermediateAssistantMessages,
        configParams,
    } : null;

    // Build the AgentLayer component.
    // When config is null, it's a passthrough (children render without AgentProvider).
    // Once config loads, the Layer identity is stable: only a baseUrl/agentId
    // change creates a new component (an intentional remount — fresh client).
    const hasConfig = !!config && !!baseUrl;
    const AgentLayer = useMemo(() => {
        if (!hasConfig) {
            return ({ children }: { children: React.ReactNode }) =>
                React.createElement(React.Fragment, null, children);
        }

        const Layer = ({ children }: { children: React.ReactNode }) => {
            const agent = useAgent(agentOptionsRef.current!);
            return React.createElement(AgentProvider, { value: agent, children });
        };
        Layer.displayName = 'AgentLayer';
        return Layer;
        // agentOptionsRef is stable; baseUrl/agentId feed useAgent's useState
        // initializer, so their change must mint a new component identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasConfig, baseUrl, agentId]);

    return { config, isLoading, error, AgentLayer };
}
