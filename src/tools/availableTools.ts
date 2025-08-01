// availableTools.ts
// This file lives on the front end and defines all tool schemas
// (both frontend-handled and backend-handled tools)

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
    description: "Book a Demo using Calendly",
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
        title: { type: "string", description: "Notification title" },
        message: { type: "string", description: "Notification message" }
      },
      required: ["title", "message"]
    }
  }
];

// Backend tools (registered here so the UI knows their schemas)
export const backendTools: StandardTool[] = [
  {
    name: "book_demo",
    description: "Book a demo with our sales team via Calendly.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "User's full name" },
        email: { type: "string", description: "User's email address" },
        // event_type_id: { type: "string", description: "Calendly event type ID" }
      },
      required: ["name", "email"]
    }
  }
];

// All tools combined for passing to AG‑UI
export const allTools: StandardTool[] = [
  ...frontendTools,
  ...backendTools
];
