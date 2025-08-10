import React from 'react';
import { ToolDefinition } from '../types/index';
import SocoOutlineSignupFlow from './SocoOutlineResults'
import SignupForm from './SignupForm'

export function createSmarketingTools(): Record<string, ToolDefinition> {
    return {
        // Frontend Tools
        changeBackgroundColor: {
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
            handler: (args: any, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) => {
                document.body.style.backgroundColor = args.color;
                // Optionally store state
                updateState('changeBackgroundColor', { color: args.color, timestamp: Date.now() });
                return `Background color changed to ${args.color}`;
            },
            isFrontend: true
        },
        
        showCalendlyWidget: {
            definition: {
                name: "showCalendlyWidget",
                description: "Book a demo with our sales team via Calendly. Displays a Calendly widget.",
                parameters: {
                    type: "object",
                    properties: {
                        height: { type: "number", description: "Widget height in pixels" }
                    },
                    required: []
                }
            },
            handler: (args: any) => {
                // Auto-generate event_type_id (hardcoded or random)
                const calendly_url = 'https://meetings-na2.hubspot.com/sheryl-porter'
                // Push a calendly message to chat (assume a global or context function is available)
                if (window && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('addCalendlyChatMessage', {
                        detail: {
                            id: `calendly_${Date.now()}`,
                            role: 'assistant',
                            type: 'calendly',
                            url: calendly_url,
                            height: args.height || 600
                        }
                    }));
                }
                return `Calendly widget displayed`;
            },
            renderer: (args: any, result: string, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) => {
                // Return JSX for the Calendly widget
                return React.createElement('iframe', {
                    src: args.url,
                    width: '100%',
                    height: args.height || 600,
                    frameBorder: '0',
                    title: 'Calendly Widget',
                    style: { border: '1px solid #ccc', borderRadius: '8px' }
                });
            },
            isFrontend: true
        },
        
        showNotification: {
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
            handler: (args: any, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) => {
                if (import.meta.env.REACT_APP_NOTIFICATION_PERMISSION === 'true') {
                    if (Notification.permission === 'granted') {
                        new Notification(args.title, { body: args.message });
                        updateState('showNotification', { title: args.title, message: args.message, timestamp: Date.now() });
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
        },

        
        // Backend Tools
        soco_outline_tool: {
            definition: {
                name: "soco_outline_tool",
                description: "Generates a course outline based on a provided topic, including modules, a course title, an image prompt for AI generation, and a subject matter description.",
                parameters: {
                    type: "object",
                    properties: {
                        course_topic: {
                            type: "string",
                            description: "The provided course topic from the user"
                        },
                    },
                    required: ["course_topic"]
                }
            },
            // No handler - this is executed by backend
            renderer: (args: any, result?: string) => {
                return <SocoOutlineSignupFlow outline={ args } />
            },
            isFrontend: false
        },

        approve_outline_tool: {
            definition: {
                "name": "approve_outline_tool",
                "description": "Approves the previously generated course outline and proceeds with course creation. Should be invoked when the user affirms they want to proceed after receiving a soco_outline_tool message.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            renderer: (args: any, result?: string) => <SignupForm/>,
            handler: (args: any, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) => {
                console.log('approval handled');
                return 'Outline approved';
            },
            isFrontend: false,
        }
    };
}