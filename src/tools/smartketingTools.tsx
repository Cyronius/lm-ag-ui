import React from 'react';
import { ToolDefinition } from '../types/index';
import SocoOutlineSignupFlow from './SocoOutlineResults'
import SignupForm from './SignupForm'
import { CalendarArtifact } from './CalendarArtifact';

export function createSmarketingTools(): Record<string, ToolDefinition> {
    return {
        
        // Frontend Tools
        changeBackgroundColor: {
            definition: {
                name: "changeBackgroundColor",
                description: "Change the background color of the page.",
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
        
        showCalendarWidget: {
            definition: {
                name: "showCalendarWidget",
                description: "Book a demo with our sales team via a calendar. Displays the Calendar widget.",
                parameters: {
                    type: "object",
                    properties: {
                        height: { type: "number", description: "Widget height in pixels" }
                    },
                    required: []
                }
            },
            handler: (args: any) => {                
                return `Calendar widget displayed`;
            },
            renderer: (args: any, result?: string) =>  <CalendarArtifact url="https://meetings-na2.hubspot.com/sheryl-porter" />,
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
            renderer: (args: any, result?: string) => {
                return <SocoOutlineSignupFlow outline={ args } />
            },
            isFrontend: false
        },

        transition_to_signup_tool: {
            definition: {
                "name": "transition_to_signup_tool",
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
                return `{ "message": "Outline approved" }`;                
            },
            isFrontend: false,            
        },

        create_account_tool: {
            definition: {
                "name": "create_account_tool",
                "description": "invoke this tool when the user requests to try out learner mobile or create a learner mobile account",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            renderer: (args: any, result?: string) => <SignupForm/>,
            handler: (args: any, updateState: (toolName: string, data: any) => void, getState: (toolName?: string) => any) => {   
                // TODO: should be able to return objects directly.
                return JSON.stringify({ message: 'signup form invoked' })
            },            
            isFrontend: true,
        }
    };
}