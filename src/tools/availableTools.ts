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

    // Backend-only tools (not registered on the frontend) are executed by the AG-UI middleware without the frontend being notified;
    // their results are sent back as text or data events from the agent. This is often preferred for things like knowledge base tools,
    // where direct UX involvement would just add latency for no benefit.
    // Tools that *are* registered on the frontend (even if they're backend tools) allow the UX to intercept, approve, or orchestrate
    // tool calls before execution (human-in-the-loop). Whether you add an approval step or just extra UX is up to your implementation.
    // The AG-UI docs describe this briefly: https://docs.ag-ui.com/concepts/tools

//   {
//     name: "sendEmail",
//     description: "Send an email to a recipient",
//     parameters: {
//       type: "object",
//       properties: {
//         to: { 
//           type: "string", 
//           description: "Email recipient" 
//         },
//         subject: { 
//           type: "string", 
//           description: "Email subject" 
//         },
//         body: { 
//           type: "string", 
//           description: "Email body" 
//         }
//       },
//       required: ["to", "subject", "body"]
//     }
//   }
];

// All tools combined for passing to AG-UI
export const allTools: StandardTool[] = [
  ...frontendTools,
  ...backendTools
];