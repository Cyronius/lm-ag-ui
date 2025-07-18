import { StandardTool } from '../types/index';

// Frontend tools that will be handled by the frontend
export const frontendTools: StandardTool[] = [
  {
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
  {
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
  {
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
  }
];

// Example backend tools (these would be handled by the backend)
export const backendTools: StandardTool[] = [
  {
    name: "searchDatabase",
    description: "Search the company database for information",
    parameters: {
      type: "object",
      properties: {
        query: { 
          type: "string", 
          description: "Search query" 
        }
      },
      required: ["query"]
    }
  },
  {
    name: "sendEmail",
    description: "Send an email to a recipient",
    parameters: {
      type: "object",
      properties: {
        to: { 
          type: "string", 
          description: "Email recipient" 
        },
        subject: { 
          type: "string", 
          description: "Email subject" 
        },
        body: { 
          type: "string", 
          description: "Email body" 
        }
      },
      required: ["to", "subject", "body"]
    }
  }
];

// All tools combined for passing to AG-UI
export const allTools: StandardTool[] = [
  ...frontendTools,
  ...backendTools
];