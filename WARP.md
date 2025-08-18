# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common Development Commands

### Build and Development
- **Development server**: `npm run dev` - Starts the Smithery CLI development server
- **Build/Test**: `npm run build` or `npm run test` - Both execute the TypeScript source directly via tsx
- **Install dependencies**: `npm install`

### Smithery Deployment
- **Deploy to Smithery**: Push to GitHub and configure in Smithery dashboard
- **Local development**: Use `npx @smithery/cli dev` for local testing with Smithery platform

## Architecture Overview

### Core Structure
This is a **Model Context Protocol (MCP) server** that provides AI agents with tools to interact with Twitch streams. The entire server is implemented in a single TypeScript file (`src/index.ts`) following a stateless server pattern.

### Key Architectural Components

#### Configuration Schema
Uses Zod for runtime validation of Twitch API credentials:
- `twitchClientId`: Twitch application client ID
- `twitchAuthToken`: OAuth token for API access
- `twitchBroadcasterId`: Target broadcaster's user ID  
- `twitchChannel`: Channel name for chat monitoring

#### In-Memory State Management
- **Chat Storage**: Maintains last 100 messages in memory (`recentMessages` array)
- **Stateless Design**: No persistent storage - suitable for serverless deployment
- **Message Simulation**: Currently simulates chat rather than real IRC/WebSocket integration

#### Twitch API Integration
- **Centralized API Client**: `makeTwitchApiCall()` function handles all Twitch Helix API interactions
- **Error Handling**: Custom `TwitchApiError` interface for consistent error responses
- **Authentication**: Bearer token authentication with Client-ID headers

### Smart Moderation System

#### User Resolution Logic
The server implements intelligent user targeting for moderation:
1. **Explicit Username**: Direct username matching from recent chat
2. **Behavioral Descriptors**: Keywords like "toxic", "spam", "rude" map to message content analysis
3. **Fallback**: Returns recent chat log for AI review when user cannot be resolved

#### Automated Timeout Duration
Timeout durations are automatically determined based on violation severity:
- Spam/emotes: 5 minutes
- Toxic behavior: 30 minutes  
- Severe violations: 1 hour
- Default: 10 minutes

### Available MCP Tools

#### Chat & Analysis
- `sendMessageToChat`: Send messages to chat (currently simulated)
- `getRecentChatLog`: Retrieve last 20 chat messages for context
- `analyzeChat`: Word frequency analysis with common word filtering

#### Stream Management
- `createTwitchPoll`: Create polls with multiple choices
- `createTwitchPrediction`: Create predictions with outcomes
- `createTwitchClip`: Generate clips of current stream
- `updateStreamTitle`: Change stream title
- `updateStreamCategory`: Update game category (with category search)

#### Moderation
- `timeoutUser`: Timeout users with smart duration selection
- `banUser`: Permanently ban users from chat

## Development Guidelines

### Code Patterns
- **Functional Approach**: Server creation via factory function `createStatelessServer()`
- **Tool Registration**: Use `server.tool()` with Zod schema validation
- **Async/Await**: All API interactions use modern async patterns
- **Error Boundaries**: Comprehensive error handling with typed error responses

### API Credentials
- Never commit API tokens to the repository
- Configuration is injected via the config parameter
- Use environment variables or secure configuration management

### Testing Considerations
- Current implementation uses simulated chat for development
- Real deployment would require IRC or WebSocket chat integration
- Smithery platform provides the runtime environment for MCP servers

### Deployment Requirements
- **Node.js 18+** required for runtime
- **Smithery platform** for production deployment
- **Twitch API application** with appropriate scopes for moderation and stream management
- **Broadcaster permissions** for the configured channel
