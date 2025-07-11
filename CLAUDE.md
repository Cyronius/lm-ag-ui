# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Start Development Server
```bash
npm start
```
Starts the Vite development server at `http://localhost:8080` (custom port, not default 3000)

### Build for Production
```bash
npm run build
```
Creates optimized production build in `dist/` directory

### Preview Production Build
```bash
npm run preview
```
Serves the production build locally for testing

### Testing
```bash
npm test
```
Currently configured to exit with success (no test runner configured)

## Architecture Overview

This is a React-based chat interface application built with:
- **Vite** for build tooling and development server
- **Material-UI (MUI)** for component library and theming
- **TypeScript** for type safety
- **React Markdown** for rendering bot responses with markdown support
- **CopilotKit** for AI integration, messaging protocol, and intelligent suggestions

### Key Components Structure

- **App.tsx**: Root component that provides MUI theme, CopilotKit provider, and renders Header + ChatInterface
- **ChatInterface.tsx**: Main chat logic, handles message state, API calls, and user input (uses CopilotKit message format)
- **ChatMessages.tsx**: Renders message list with markdown support for bot responses (adapted for CopilotKit Message format)
- **ChatSuggestions.tsx**: Uses CopilotKit's `useCopilotChatSuggestions` for intelligent, context-aware suggestions
- **Header.tsx**: Simple header with branding and description

### Data Flow

1. User sends message via ChatInterface
2. Messages follow CopilotKit's standard message format (`Message` interface)
3. CopilotKit provider manages communication with backend via `/api/copilotkit` endpoint
4. Backend adapter bridges CopilotKit protocol with existing `CHAT_SERVER_URL` endpoints
5. Bot responses are parsed and rendered as markdown using CopilotKit message structure

### Type System

Core types defined in `src/types.ts` (CopilotKit-compatible):
- `Message`: Standard CopilotKit message with id, role, content, createdAt
- `MessageContent`: Support for text and image content types
- `ToolCall` & `ToolCallResult`: Function call integration
- Legacy types maintained for backward compatibility during migration

### CopilotKit Integration

- **Provider**: `<CopilotKit runtimeUrl="/api/copilotkit">` wraps the entire app
- **Suggestions**: `useCopilotChatSuggestions` provides intelligent, context-aware suggestions
- **Message Format**: Uses CopilotKit's standard message protocol as "golden truth"
- **Runtime API**: `/api/copilotkit/route.ts` serves as bridge between CopilotKit and existing backend

### Backend Integration

- **Primary**: CopilotKit runtime at `/api/copilotkit` 
- **Bridge**: Custom adapter translates between CopilotKit protocol and existing endpoints
- **Legacy**: Maintains compatibility with existing `CHAT_SERVER_URL` (`/run_sse`, `/run_agui`)
- **Session Management**: Backend handles session creation/management to match CopilotKit expectations
- **Environment**: Uses `VITE_PYTHON_SERVER_URL` for backend communication

### Migration Strategy

The app uses a hybrid approach:
1. **Message Format**: Converted to CopilotKit's standard Message interface
2. **UI Components**: Preserved existing React components with adaptations
3. **Suggestions**: Replaced hardcoded suggestions with CopilotKit's intelligent system
4. **Backend Bridge**: Custom adapter connects CopilotKit to existing API endpoints

### Styling

- Uses MUI theme system (defined in `src/theme.ts`)
- Custom CSS for chat-specific styling in component `.css` files
- CopilotKit styles imported in App.tsx
- Responsive design with Material-UI components

## Environment Variables

- `VITE_PYTHON_SERVER_URL`: Backend API URL (required for chat functionality)

## Key Dependencies

- `@mui/material`: UI component library
- `@emotion/react` & `@emotion/styled`: CSS-in-JS styling for MUI
- `react-markdown` & `remark-gfm`: Markdown rendering with GitHub flavored markdown
- `lucide-react`: Icon library for UI elements
- `@copilotkit/react-core`: AI integration library (currently unused)