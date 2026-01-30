// Re-export types (these are type-only, no runtime cost)
export type {
    DiagramPlugin,
    MermaidInstance,
    MermaidPluginOptions,
    MermaidConfig
} from '@streamdown/mermaid';

import type {
    DiagramPlugin,
    MermaidInstance,
    MermaidPluginOptions,
    MermaidConfig
} from '@streamdown/mermaid';

// Module-level cache for the loaded @streamdown/mermaid module
let loadedModule: typeof import('@streamdown/mermaid') | null = null;
let loadPromise: Promise<typeof import('@streamdown/mermaid')> | null = null;

async function loadMermaidModule(): Promise<typeof import('@streamdown/mermaid')> {
    if (loadedModule) return loadedModule;
    if (!loadPromise) {
        loadPromise = import('@streamdown/mermaid').then(mod => {
            loadedModule = mod;
            return mod;
        });
    }
    return loadPromise;
}

/**
 * Creates a lazy-loading mermaid plugin with custom configuration.
 * Mirrors createMermaidPlugin from @streamdown/mermaid.
 */
export function createLazyMermaidPlugin(options?: MermaidPluginOptions): DiagramPlugin {
    // Store config to pass to real plugin when loaded
    let pendingConfig: MermaidConfig | undefined = options?.config;

    return {
        name: "mermaid",
        type: "diagram",
        language: "mermaid",

        getMermaid(config?: MermaidConfig): MermaidInstance {
            // Merge any config passed here with options config
            const mergedConfig = config ?? pendingConfig;

            return {
                initialize(initConfig: MermaidConfig) {
                    // Store for when real plugin loads
                    pendingConfig = { ...pendingConfig, ...initConfig };
                    // If already loaded, initialize immediately
                    if (loadedModule) {
                        loadedModule.createMermaidPlugin(options)
                            .getMermaid(pendingConfig)
                            .initialize(initConfig);
                    }
                },

                async render(id: string, source: string): Promise<{ svg: string }> {
                    // Lazy-load on first render
                    const mod = await loadMermaidModule();
                    const realPlugin = mod.createMermaidPlugin(options);
                    const instance = realPlugin.getMermaid(mergedConfig);
                    return instance.render(id, source);
                }
            };
        }
    };
}

/**
 * Pre-configured lazy mermaid plugin with default settings.
 * Drop-in replacement for `mermaid` from @streamdown/mermaid.
 */
export const mermaid: DiagramPlugin = createLazyMermaidPlugin();

// Alias for clearer naming when importing
export const lazyMermaid = mermaid;
