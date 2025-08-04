import { StandardTool, ArtifactData } from '../types/index';

// Tool handler executes the tool's logic (frontend tools only)
export type ToolHandler = (args: any) => string;

// Tool renderer handles display/artifacts for the tool result (both frontend and backend)
export type ToolRenderer = (args: any, result?: string) => void;

export interface ToolContext {
    setArtifacts: React.Dispatch<React.SetStateAction<Map<string, ArtifactData>>>;
}

export interface UnifiedToolDefinition {
    definition: StandardTool;
    handler?: ToolHandler;  // Only for frontend tools
    renderer?: ToolRenderer; // For tools that need special rendering
    isFrontend: boolean;
}

export function createUnifiedTools(context: ToolContext): Map<string, UnifiedToolDefinition> {
    const { setArtifacts } = context;

    return new Map([
        // Frontend Tools
        ['changeBackgroundColor', {
            definition: {
                name: "changeBackgroundColor",
                description: "Change the background color of the page",
                parameters: {
                    type: "object",
                    properties: {
                        color: { 
                            type: "string", 
                            description: "CSS color value (hex, rgb, or named color)" 
                        }
                    },
                    required: ["color"]
                }
            },
            handler: (args: any) => {
                document.body.style.backgroundColor = args.color;
                return `Background color changed to ${args.color}`;
            },
            isFrontend: true
        }],
        
        ['showCalendlyWidget', {
            definition: {
                name: "showCalendlyWidget",
                description: "Display a Calendly scheduling widget inline in the chat",
                parameters: {
                    type: "object",
                    properties: {
                        url: { 
                            type: "string", 
                            description: "Calendly scheduling URL" 
                        },
                        height: { 
                            type: "number", 
                            description: "Widget height in pixels" 
                        }
                    },
                    required: ["url"]
                }
            },
            handler: (args: any) => {
                const artifactId = `calendly_${Date.now()}`;
                setArtifacts(prev => new Map(prev).set(artifactId, {
                    type: 'calendly',
                    url: args.url,
                    height: args.height || 600
                }));
                return `Calendly widget displayed`;
            },
            isFrontend: true
        }],
        
        ['showNotification', {
            definition: {
                name: "showNotification",
                description: "Show a browser notification to the user",
                parameters: {
                    type: "object",
                    properties: {
                        title: { 
                            type: "string", 
                            description: "Notification title" 
                        },
                        message: { 
                            type: "string", 
                            description: "Notification message" 
                        }
                    },
                    required: ["title", "message"]
                }
            },
            handler: (args: any) => {
                if (import.meta.env.REACT_APP_NOTIFICATION_PERMISSION === 'true') {
                    if (Notification.permission === 'granted') {
                        new Notification(args.title, { body: args.message });
                        return `Notification shown: ${args.title}`;
                    } else if (Notification.permission === 'default') {
                        Notification.requestPermission().then(permission => {
                            if (permission === 'granted') {
                                new Notification(args.title, { body: args.message });
                            }
                        });
                        return `Notification permission requested`;
                    } else {
                        return `Notification permission denied`;
                    }
                } else {
                    return `Notifications disabled in configuration`;
                }
            },
            isFrontend: true
        }],

        // // Backend Tools
        // ['soco_outline_tool', {
        //     definition: {
        //         name: "soco_outline_tool",
        //         description: "Generates a course outline based on a provided topic, including modules, a course title, an image prompt for AI generation, and a subject matter description.",
        //         parameters: {
        //             type: "object",
        //             properties: {
        //                 course_topic: {
        //                     type: "string",
        //                     description: "The provided course topic from the user"
        //                 },
        //             },
        //             required: ["course_topic"]
        //         }
        //     },
        //     // No handler - this is executed by backend
        //     renderer: (args: any, result?: string) => {
        //         // If this tool needs special rendering, implement it here
        //         // For example, you might want to display course outlines in a special format
        //         console.log('Course outline generated for:', args.course_topic);
        //         if (result) {
        //             // Could create an artifact for structured course outline display
        //             // setArtifacts(prev => new Map(prev).set(`outline_${Date.now()}`, {
        //             //     type: 'course-outline',
        //             //     content: result,
        //             //     topic: args.course_topic
        //             // }));
        //         }
        //     },
        //     isFrontend: false
        // }]
    ]);
}

// Helper functions
export function getAllToolDefinitions(tools: Map<string, UnifiedToolDefinition>): StandardTool[] {
    return Array.from(tools.values()).map(tool => tool.definition);
}

export function getFrontendToolDefinitions(tools: Map<string, UnifiedToolDefinition>): StandardTool[] {
    return Array.from(tools.values())
        .filter(tool => tool.isFrontend)
        .map(tool => tool.definition);
}

export function getBackendToolDefinitions(tools: Map<string, UnifiedToolDefinition>): StandardTool[] {
    return Array.from(tools.values())
        .filter(tool => !tool.isFrontend)
        .map(tool => tool.definition);
}

export function getToolHandlers(tools: Map<string, UnifiedToolDefinition>): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    tools.forEach((tool, name) => {
        if (tool.handler) {
            handlers.set(name, tool.handler);
        }
    });
    return handlers;
}

export function getToolRenderers(tools: Map<string, UnifiedToolDefinition>): Map<string, ToolRenderer> {
    const renderers = new Map<string, ToolRenderer>();
    tools.forEach((tool, name) => {
        if (tool.renderer) {
            renderers.set(name, tool.renderer);
        }
    });
    return renderers;
}