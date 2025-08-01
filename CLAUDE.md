# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm start` (runs on http://localhost:3000)
- **Build for production**: `npm run build`
- **Preview production build**: `npm run preview`
- **Tests**: No test runner configured - `npm test` returns success

## Architecture Overview

This is a React-based chat interface application built with Vite, TypeScript, and Material-UI that integrates with the AG-UI framework for agent communication.

### Core Architecture

**Frontend-Backend Communication**: The app uses the AG-UI framework (`@ag-ui/client`, `@ag-ui/core`) to communicate with a Python backend server. The `AgentService` class handles HTTP-based streaming communication with the backend at `${VITE_PYTHON_SERVER_URL}/smarketing` (defaults to `http://localhost:8000/smarketing`).

**State Management**: 
- Session management via `useSessionManager` hook handles thread/run IDs for conversation continuity
- Agent communication via `useAgent` hook manages streaming responses and tool execution
- Chat interface state managed in `ChatInterface` component with local React state

**Tool System**: Hybrid frontend/backend tool architecture:
- **Frontend tools** (handled by React): `changeBackgroundColor`, `showCalendlyWidget`, `showNotification`
- **Backend tools** (handled by Python server): `soco_outline_tool` and potentially others
- Tool definitions in `src/tools/unifiedTools.ts` with both handlers and renderers, execution logic in `useAgent` hook

### Key Components

- **ChatInterface** (`src/components/ChatInterface.tsx`): Main chat UI component that orchestrates user input, message display, and agent communication
- **useAgent** (`src/hooks/useAgent.ts`): Core hook handling AG-UI event streaming, tool execution, and message state management
- **AgentService** (`src/services/AgentService.ts`): Service class wrapping AG-UI HttpAgent for backend communication
- **ArtifactRenderer** (`src/components/artifacts/`): Handles display of dynamic content like Calendly widgets

### Message Flow

1. User input → ChatInterface → AgentService.runAgent()
2. Backend streams events via AG-UI protocol
3. useAgent hook processes events (text deltas, tool calls, etc.)
4. Frontend tools execute locally, backend tools handled by server
5. Completed messages added to conversation history

## Environment Variables

- `VITE_PYTHON_SERVER_URL`: Backend server URL (default: http://localhost:8000)
- `VITE_STREAM_TIMEOUT`: Stream timeout in ms (default: 30000)
- `REACT_APP_NOTIFICATION_PERMISSION`: Enable browser notifications (default: false)

## Dependencies

- **Core**: React 18, TypeScript, Vite
- **UI**: Material-UI v5, Lucide React icons
- **Agent Communication**: @ag-ui/client, @ag-ui/core
- **Utilities**: UUID, RxJS, react-markdown with remark-gfm