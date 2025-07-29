● Based on my analysis of the codebase, I can now answer your questions about tool call event flows:

  Tool Call Event Flow: Client-Server Sequence

  1. Are tool calls always streamed back to the client?

  Not always. The system supports both patterns:

  Streamed Tool Calls (Visible to Client):
  - Tool calls using useCopilotAction are always streamed to the client
  - The server sends: TOOL_CALL_START → TOOL_CALL_ARGS → TOOL_CALL_END → TOOL_CALL_RESULT
  - Client sees the tool being called and can render UI during execution

  Server-Side Only Tool Calls (Hidden from Client):
  - Some integrations handle tools entirely server-side
  - The ADK middleware supports "client proxy tools" that bridge this gap
  - Server can execute tools internally and only send back the final result

  2. Human-in-the-Loop Tool Invocation

  The client tells the server to invoke tools through two mechanisms:

  Mechanism 1: renderAndWaitForResponse (HITL)

  useCopilotAction({
    name: "generate_task_steps",
    renderAndWaitForResponse: ({ args, respond, status }) => {
      return <StepsFeedback args={args} respond={respond} status={status} />;
    },
  });

  Flow:
  1. Server streams tool call to client: TOOL_CALL_START → TOOL_CALL_ARGS → TOOL_CALL_END
  2. Client renders UI component with args (the tool parameters)
  3. Human interacts with UI (e.g., modifying steps, approving/rejecting)
  4. Client calls respond({ accepted: true, steps: modifiedSteps })
  5. Server receives response and continues execution
  6. Server sends TOOL_CALL_RESULT with final outcome

  Mechanism 2: useLangGraphInterrupt (LangGraph-specific)
  
  useLangGraphInterrupt({
    render: ({ event, resolve }) => <InterruptComponent event={event} resolve={resolve} />
  });

  Flow:
  1. LangGraph agent hits an interrupt point
  2. Server sends interrupt event to client
  3. Client renders custom UI with event.value data
  4. Human makes decision in UI
  5. Client calls resolve("user decision text")
  6. Server receives resolution and continues graph execution

  Key Architectural Insights

  Client-Side Tools: Tools defined with useCopilotAction execute client-side JavaScript functions. The server streams the tool call, client executes it, and sends back the result.

  Server-Side Tools: The ADK middleware can execute tools server-side and only stream the results. This is useful for tools that access server resources or need to remain hidden.

  Streaming Design: The protocol supports incremental argument streaming (TOOL_CALL_ARGS with deltas) allowing for real-time UI updates as the LLM generates tool parameters.

  HITL Pattern: Human-in-the-loop is implemented by streaming tool calls to the client, rendering custom UI for human input, then sending the human decision back to continue server execution.

  This design enables flexible tool execution patterns while maintaining a consistent event-driven protocol between client and server.




You're absolutely correct! I was wrong in my initial assessment. Let me clarify the actual architecture:

  ADK Middleware: Dynamic Tool Registration, Not Client Proxy Tools

  You're right - you ARE seeing TOOL_CALL_START, ARGS, and END events because the ADK middleware has a much more elegant architecture than I initially described.

  How It Actually Works

  Dynamic Tool Registration:
  1. Client defines tools with useCopilotAction (like generate_task_steps)
  2. CopilotKit runtime automatically sends these tool definitions in RunAgentInput.tools
  3. ADK middleware dynamically creates proxy tools for the ADK agent on each request
  4. ADK agent "calls" these proxy tools, which emit events back to client
  5. Client receives events, executes the real tool logic, sends results back

  The Key Insight: All ADK Tools Are Client Proxy Tools

  From the codebase analysis:

  # All client-side tools become ClientProxyTools automatically
  if input.tools:
      toolset = ClientProxyToolset(
          ag_ui_tools=input.tools,  # <- From client useCopilotAction
          event_queue=event_queue
      )

  So when you define:
  useCopilotAction({
    name: "generate_task_steps",
    renderAndWaitForResponse: ({ args, respond, status }) => {
      return <StepsFeedback args={args} respond={respond} status={status} />;
    },
  });

  What happens:
  1. ADK agent gets a ClientProxyTool with name "generate_task_steps"
  2. When agent decides to call it, proxy tool emits events to client
  3. Client sees TOOL_CALL_START/ARGS/END events
  4. Client executes renderAndWaitForResponse function
  5. Human interacts with <StepsFeedback> component
  6. Client calls respond() with result
  7. Result goes back to ADK agent as tool response

  Your Original Question: Are Client Proxy Tools Required?

  No, they're automatic! You don't manually create client proxy tools - the ADK middleware creates them automatically for any useCopilotAction tools you define. The proxy pattern is the implementation
  detail that makes client-side tools work with server-side ADK agents.

  So HITL with ADK middleware works exactly like other integrations - you define client-side tools with useCopilotAction, and the middleware transparently bridges them to the ADK agent. The events you're
  seeing are proof this dynamic bridging is working correctly.



● Based on the comprehensive README, I can now map out the complete tool execution flows for the ADK middleware. Here's a detailed breakdown:

  ADK Middleware Tool Execution Flows

  1. Frontend Tools (Client-Side Tools) Flow

  Pattern: useCopilotAction → Dynamic Proxy Creation → Event Streaming

  // 1. Client defines tool
  useCopilotAction({
    name: "generate_haiku",
    parameters: [{ name: "theme", type: "string" }],
    renderAndWaitForResponse: ({ args, respond, status }) => {
      return <HaikuGenerator args={args} respond={respond} />;
    },
  });

  Execution Flow:
  1. Tool Registration: CopilotKit runtime packages client tools in RunAgentInput.tools[]
  2. Dynamic Proxy Creation: ADK middleware creates ClientProxyTool for each client tool
  3. ADK Agent Execution: ADK agent sees and can call these proxy tools
  4. Tool Call: When ADK agent calls tool, proxy emits events:
    - TOOL_CALL_START (tool_call_id, tool_name)
    - TOOL_CALL_ARGS (arguments as JSON delta)
    - TOOL_CALL_END (completion)
  5. Client Execution: Client receives events, executes renderAndWaitForResponse
  6. Human Interaction: User interacts with UI component
  7. Result Submission: Client calls respond() with result
  8. Continuation: Result converted to ToolMessage and sent back to continue ADK execution

  2. Human-in-the-Loop (HITL) Flow

  Pattern: Long-Running Tools + renderAndWaitForResponse

  // Client HITL tool
  useCopilotAction({
    name: "request_approval",
    parameters: [{ name: "action", type: "string" }],
    renderAndWaitForResponse: ({ args, respond, status }) => {
      return <ApprovalComponent
        action={args.action}
        onApprove={() => respond({ approved: true })}
        onReject={() => respond({ approved: false })}
      />;
    },
  });

  HITL Execution Flow:
  1. ADK Agent Decision: Agent determines approval needed
  2. Proxy Tool Call: ClientProxyTool (all are long-running by default)
  3. Immediate Return: Proxy returns None immediately (fire-and-forget pattern)
  4. Event Stream: TOOL_CALL_START/ARGS/END events sent to client
  5. UI Rendering: Client renders approval interface
  6. Human Decision: User approves/rejects
  7. Result Submission: Client submits ToolMessage with decision
  8. Execution Resume: ADK agent continues with approval result
  9. Session Persistence: Session persists indefinitely until human responds

  HITL Session Management:
  # HITL sessions bypass timeout cleanup
  self.pending_tool_calls: Set[str] = set()  # Track outstanding tool call IDs for HITL

  def has_pending_tool_calls(self) -> bool:
      """Check if there are outstanding tool calls waiting for responses."""
      return len(self.pending_tool_calls) > 0

  3. Server-Only Tools Flow

  Pattern: Traditional ADK Tools (Never exposed to client)

  # Server-side ADK tool
  from google.adk.tools import BaseTool

  class WeatherTool(BaseTool):
      async def run_async(self, *, args: dict, tool_context: Any) -> dict:
          # Execute entirely on server
          weather_data = await fetch_weather_api(args['location'])
          return {"temperature": weather_data.temp, "condition": weather_data.condition}

  # Register with ADK agent directly
  agent = Agent(
      name="weather_assistant",
      tools=[WeatherTool()]  # Server-side tool
  )

  Server-Only Execution Flow:
  1. ADK Agent Call: Agent calls server-side tool directly
  2. Server Execution: Tool executes entirely on server (API calls, calculations, etc.)
  3. Immediate Result: Tool returns result directly to agent
  4. No Client Events: Client never sees these tool calls
  5. Transparent to Protocol: AG-UI protocol unaware of server-side tool execution

  4. Hybrid Execution Mode (Mixed Tools)

  Pattern: Long-Running + Blocking Tools in Same Toolset

  # Configure mixed execution modes
  toolset = ClientProxyToolset(
      ag_ui_tools=[approval_tool, calculator_tool, weather_tool],
      event_queue=event_queue,
      is_long_running=True,  # Default for all tools
      tool_long_running_config={
          "calculate": False,      # Override: blocking tool
          "get_weather": False,    # Override: blocking tool
          # approval_tool uses default (True - long-running)
      }
  )

  Hybrid Flow:
  1. Mixed Tool Calls: Agent calls both long-running and blocking tools
  2. Differential Handling:
    - Long-running tools: Fire-and-forget, wait for client response
    - Blocking tools: Wait for result with timeout (default 300s)
  3. Concurrent Execution: Multiple tool types can execute simultaneously
  4. Result Coordination: Both types submit results via ToolMessage
  5. Unified Completion: Agent continues when all tools complete

  5. Tool-Based Generative UI Flow

  Pattern: Structured Output → Dynamic UI Generation

  // Generative UI tool
  useCopilotAction({
    name: "generate_dashboard",
    parameters: [{ name: "data_source", type: "string" }],
    renderAndWaitForResponse: ({ args, respond, status }) => {
      const dashboardConfig = JSON.parse(args.dashboard_config);
      return <DynamicDashboard
        config={dashboardConfig}
        onSave={(config) => respond({ saved: true, config })}
      />;
    },
  });

  Generative UI Flow:
  1. Structured Tool Call: Agent calls tool with structured parameters
  2. UI Generation: Client receives structured data and generates appropriate UI
  3. Dynamic Rendering: UI adapts based on tool output structure
  4. User Interaction: User interacts with generated interface
  5. Structured Response: Client responds with structured result
  6. Iterative Refinement: Agent can call tool again to refine UI

  6. Error Handling & Timeouts

  Timeout Configuration:
  adk_agent = ADKAgent(
      tool_timeout_seconds=300,        # Blocking tools timeout
      execution_timeout_seconds=600,   # Overall execution timeout
      session_timeout_seconds=1200     # Session cleanup (except HITL)
  )

  Error Flows:
  - Blocking Tool Timeout: TimeoutError after configured timeout
  - Execution Timeout: Overall execution terminates after 600s default
  - HITL Protection: Sessions with pending tool calls exempt from cleanup
  - Concurrent Limits: Automatic cleanup when max executions exceeded

  Key Implementation Insights

  1. All Client Tools are Proxied: Every useCopilotAction becomes a ClientProxyTool
  2. Long-Running by Default: All client tools use fire-and-forget pattern
  3. Event-Driven Communication: TOOL_CALL_* events bridge server→client tool calls
  4. Session Persistence: HITL sessions persist indefinitely until human responds
  5. Hybrid Support: Same agent can mix server-side and client-side tools
  6. Structured Output: Tools can return complex JSON for generative UI
  7. No Pre-registration: Tools are dynamically registered per request

  This architecture enables sophisticated workflows combining AI reasoning, human interaction, server-side computation, and dynamic UI generation in a unified system.

● Update Todos
  ⎿  ☒ Map out ADK middleware tool execution flows from README
     ☒ Document frontend tool flow pattern
     ☒ Document human-in-the-loop flow pattern
     ☒ Document server-only tool flow pattern
     ☒ Create comprehensive workflow guide




● Perfect! Now I can answer all three of your questions based on my analysis of the codebase:

  1. How does the client send tool results to the server for frontend tools?

  Via ToolMessage in subsequent RunAgentInput:

  // Client side - in renderAndWaitForResponse callback
  useCopilotAction({
    name: "generate_task_steps",
    renderAndWaitForResponse: ({ args, respond, status }) => {
      return <Component
        onComplete={(result) => {
          respond({ approved: true, data: result }); // This creates a ToolMessage
        }}
      />;
    },
  });

  Server-side processing (adk_agent.py:120-130):
  def _is_tool_result_submission(self, input: RunAgentInput) -> bool:
      """Check if this request contains tool results."""
      if not input.messages:
          return False

      last_message = input.messages[-1]
      return isinstance(last_message, ToolMessage)

  # When client calls respond(), it sends a new RunAgentInput with ToolMessage
  # Server detects this and converts to ADK FunctionResponse:
  updated_function_response_part = types.Part(
      function_response=types.FunctionResponse(
          id=tool_call_id,
          name=tool_msg["tool_name"],
          response=result,
      )
  )

  2. How does the client receive structured (JSON) data for server-only tools?

  Server-only tools don't exist in ADK middleware! This was a key insight from the CHANGELOG:

  BREAKING: Simplified to all-long-running tool execution model
  BEHAVIOR: All tools now behave as long-running tools - emit events and return None immediately

  Every tool becomes a client proxy tool, even if it's meant to be "server-only":

  1. ADK agent calls any tool → ClientProxyTool emits events
  2. Client receives structured data via TOOL_CALL_ARGS event:
  // Example: Server "calculation" tool
  TOOL_CALL_START: { tool_call_id: "call_123", tool_call_name: "calculate" }
  TOOL_CALL_ARGS: { tool_call_id: "call_123", delta: '{"expression": "2+2", "result": 4}' }
  TOOL_CALL_END: { tool_call_id: "call_123" }

  3. Client can extract JSON data from the TOOL_CALL_ARGS.delta field
  4. Client decides how to handle it:
    - Render UI (human-in-the-loop)
    - Auto-respond with computed result (simulated server execution)
    - Display results to user

  3. What effect does "long running" have on the tool flow?

  The "long-running" flag was eliminated! From CHANGELOG v0.4.0:

  REMOVED: Eliminated blocking tool execution mode - all tools now use long-running behavior
  BEHAVIOR: All tools now behave as long-running tools - emit events and return None immediately

  Current behavior (all tools are long-running):

  # ClientProxyTool always does this:
  async def _execute_proxy_tool(self, args, tool_context) -> Any:
      # Emit events
      await self.event_queue.put(ToolCallStartEvent(...))
      await self.event_queue.put(ToolCallArgsEvent(...))
      await self.event_queue.put(ToolCallEndEvent(...))

      # Return None immediately (fire-and-forget)
      return None  # Always returns None - no waiting!

  Effects of long-running pattern:
  1. Fire-and-forget: Tool returns None immediately after emitting events
  2. No timeouts: ADK execution waits indefinitely for ToolMessage response
  3. HITL-friendly: Perfect for human approval workflows
  4. Session persistence: Sessions with pending tool calls bypass cleanup
  5. Event-driven: All communication happens via events, not return values

  Historical context (for reference): The middleware used to support both:
  - Long-running tools: Fire-and-forget, perfect for HITL
  - Blocking tools: Wait for response with timeout, good for API calls

  But this was simplified to all-long-running for architectural consistency and HITL support.

  The key insight is that ADK middleware treats every client-side tool as a human-in-the-loop interaction, even if you want immediate automated responses. The client is responsible for deciding whether to
  show UI or auto-respond.
  
  

● I'll generate sample React/JS code showing how to construct a RunAgentInput with a ToolMessage to complete a pending tool execution.

● Read(../../packages/core/src/types.ts)
  ⎿  Read 100 lines (ctrl+r to expand)

● Search(pattern: "ToolMessage|RunAgentInput", path: "../../packages/core/src", output_mode: "content")
  ⎿  Found 39 lines (ctrl+r to expand)

● Perfect! Now I can generate sample React/JS code based on the actual type definitions from the codebase.

  Sample React/JS Code: Submitting Tool Results

  Here are several examples showing how to construct a RunAgentInput with ToolMessage to complete pending tool executions:

  Example 1: Human-in-the-Loop Approval Tool

  import React, { useState } from 'react';
  import { RunAgentInput, ToolMessage } from '@ag-ui/core';

  interface PendingToolCall {
    toolCallId: string;
    toolName: string;
    args: any;
    threadId: string;
  }

  function ApprovalWorkflow({ pendingToolCall }: { pendingToolCall: PendingToolCall }) {
    const [isProcessing, setIsProcessing] = useState(false);

    const submitApprovalResult = async (approved: boolean, comments?: string) => {
      setIsProcessing(true);

      // Construct the ToolMessage with human decision
      const toolMessage: ToolMessage = {
        id: `tool_result_${Date.now()}`,
        role: "tool",
        toolCallId: pendingToolCall.toolCallId,
        content: JSON.stringify({
          approved,
          approver: "user_123",
          timestamp: new Date().toISOString(),
          comments: comments || "",
          original_action: pendingToolCall.args.action
        })
      };

      // Create RunAgentInput to continue execution
      const continueInput: RunAgentInput = {
        threadId: pendingToolCall.threadId,
        runId: `${pendingToolCall.threadId}_continue_${Date.now()}`,
        state: {},
        messages: [toolMessage], // Only the tool result
        tools: [], // No new tools needed for continuation
        context: [],
        forwardedProps: {}
      };

      try {
        // Send to your agent endpoint
        const response = await fetch(`/api/copilotkit/adk-middleware`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(continueInput)
        });

        // Handle streaming response
        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Process streaming events
            const chunk = new TextDecoder().decode(value);
            console.log('Received event:', chunk);
          }
        }
      } catch (error) {
        console.error('Failed to submit tool result:', error);
      } finally {
        setIsProcessing(false);
      }
    };

    return (
      <div className="approval-workflow">
        <h3>Approval Required</h3>
        <p><strong>Action:</strong> {pendingToolCall.args.action}</p>
        <p><strong>Tool:</strong> {pendingToolCall.toolName}</p>

        <div className="approval-buttons">
          <button
            onClick={() => submitApprovalResult(true, "Approved by user")}
            disabled={isProcessing}
            className="approve-btn"
          >
            ✅ Approve
          </button>

          <button
            onClick={() => submitApprovalResult(false, "Rejected by user")}
            disabled={isProcessing}
            className="reject-btn"
          >
            ❌ Reject
          </button>
        </div>
      </div>
    );
  }

  Example 2: Form-Based Tool Result Submission

  import React, { useState } from 'react';
  import { RunAgentInput, ToolMessage } from '@ag-ui/core';

  interface TaskStep {
    description: string;
    status: 'enabled' | 'disabled' | 'executing';
  }

  function TaskStepsForm({
    toolCallId,
    threadId,
    initialSteps
  }: {
    toolCallId: string;
    threadId: string;
    initialSteps: TaskStep[];
  }) {
    const [steps, setSteps] = useState<TaskStep[]>(initialSteps);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleStepToggle = (index: number) => {
      setSteps(prevSteps =>
        prevSteps.map((step, i) =>
          i === index
            ? { ...step, status: step.status === 'enabled' ? 'disabled' : 'enabled' }
            : step
        )
      );
    };

    const submitStepsResult = async () => {
      setIsSubmitting(true);

      const enabledSteps = steps.filter(step => step.status === 'enabled');

      // Create tool result with user's selections
      const toolMessage: ToolMessage = {
        id: `steps_result_${toolCallId}`,
        role: "tool",
        toolCallId: toolCallId,
        content: JSON.stringify({
          accepted: true,
          selected_steps: enabledSteps,
          total_steps: steps.length,
          modified_by: "user",
          timestamp: Date.now()
        })
      };

      // Continue agent execution
      const continueInput: RunAgentInput = {
        threadId: threadId,
        runId: `${threadId}_steps_${Date.now()}`,
        state: {},
        messages: [toolMessage],
        tools: [],
        context: [],
        forwardedProps: {}
      };

      try {
        await submitToAgent(continueInput);
      } catch (error) {
        console.error('Failed to submit steps:', error);
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="task-steps-form">
        <h3>Select Steps to Execute</h3>

        {steps.map((step, index) => (
          <div key={index} className="step-item">
            <label>
              <input
                type="checkbox"
                checked={step.status === 'enabled'}
                onChange={() => handleStepToggle(index)}
              />
              <span className={step.status !== 'enabled' ? 'line-through' : ''}>
                {step.description}
              </span>
            </label>
          </div>
        ))}

        <button
          onClick={submitStepsResult}
          disabled={isSubmitting}
          className="submit-steps-btn"
        >
          {isSubmitting ? 'Submitting...' : '✨ Execute Selected Steps'}
        </button>
      </div>
    );
  }

  Example 3: Automated Tool Response (Simulated Server Tool)

  import { RunAgentInput, ToolMessage } from '@ag-ui/core';

  // Simulate a "server-side" calculation tool that the client handles automatically
  async function handleCalculationTool(
    toolCallId: string,
    threadId: string,
    expression: string
  ) {
    // Simulate calculation (in real app, might call API)
    const result = evaluateExpression(expression);

    const toolMessage: ToolMessage = {
      id: `calc_${toolCallId}`,
      role: "tool",
      toolCallId: toolCallId,
      content: JSON.stringify({
        expression: expression,
        result: result,
        computed_by: "client_calculator",
        timestamp: Date.now()
      })
    };

    const continueInput: RunAgentInput = {
      threadId: threadId,
      runId: `${threadId}_calc_${Date.now()}`,
      state: {},
      messages: [toolMessage],
      tools: [],
      context: [],
      forwardedProps: {}
    };

    return continueInput;
  }

  function evaluateExpression(expr: string): number {
    // Simple calculator - in production use a proper expression parser
    try {
      return Function(`"use strict"; return (${expr})`)();
    } catch (error) {
      return NaN;
    }
  }

  Example 4: Complete Hook for Tool Result Submission

  import { useState, useCallback } from 'react';
  import { RunAgentInput, ToolMessage } from '@ag-ui/core';

  interface UseToolResultSubmission {
    submitToolResult: (
      toolCallId: string,
      threadId: string,
      result: any
    ) => Promise<void>;
    isSubmitting: boolean;
    error: string | null;
  }

  export function useToolResultSubmission(): UseToolResultSubmission {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submitToolResult = useCallback(async (
      toolCallId: string,
      threadId: string,
      result: any
    ) => {
      setIsSubmitting(true);
      setError(null);

      try {
        // Create ToolMessage
        const toolMessage: ToolMessage = {
          id: `result_${toolCallId}_${Date.now()}`,
          role: "tool",
          toolCallId: toolCallId,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        };

        // Create continuation input
        const continueInput: RunAgentInput = {
          threadId: threadId,
          runId: `${threadId}_continue_${Date.now()}`,
          state: {},
          messages: [toolMessage],
          tools: [],
          context: [],
          forwardedProps: {}
        };

        // Submit to agent
        const response = await fetch('/api/copilotkit/adk-middleware', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(continueInput)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Handle success (you might want to process the response)
        console.log('Tool result submitted successfully');

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('Failed to submit tool result:', err);
      } finally {
        setIsSubmitting(false);
      }
    }, []);

    return { submitToolResult, isSubmitting, error };
  }

  Example 5: Integration with CopilotKit's respond function

  // This shows how CopilotKit's respond function internally creates the ToolMessage

  useCopilotAction({
    name: "generate_task_steps",
    parameters: [
      {
        name: "steps",
        type: "object[]",
        // ... parameter definitions
      }
    ],
    renderAndWaitForResponse: ({ args, respond, status }) => {
      const handleApproval = (approved: boolean, selectedSteps: any[]) => {
        // CopilotKit's respond function internally does something like:
        respond({
          approved: approved,
          steps: selectedSteps,
          timestamp: Date.now()
        });

        // This gets converted to a ToolMessage and RunAgentInput automatically:
        // {
        //   id: "auto_generated_id",
        //   role: "tool",
        //   toolCallId: "call_id_from_original_tool_call",
        //   content: JSON.stringify({
        //     approved: approved,
        //     steps: selectedSteps,
        //     timestamp: Date.now()
        //   })
        // }
      };

      return (
        <StepsFeedback
          args={args}
          onComplete={handleApproval}
          status={status}
        />
      );
    },
  });

  Key Points:

  1. ToolMessage Structure: Must include id, role: "tool", toolCallId (matching the original call), and content (usually JSON string)
  2. RunAgentInput: Only needs the ToolMessage in the messages array - no new tools or complex state needed
  3. Content Format: Can be any JSON structure that makes sense for your tool - the ADK agent will receive it as the tool result
  4. Thread Continuity: Use the same threadId to continue the conversation, but generate a new runId
  5. Automatic vs Manual: CopilotKit's respond() function handles this automatically, but you can also manually construct RunAgentInput for custom workflows