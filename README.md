# Twitch MCP Server

A comprehensive Twitch MCP (Model Context Protocol) server providing chat moderation, stream management, and Twitch API integration for AI systems.

## For Streamers

- Use this server via Smithery → Cursor (no local install needed)
- Quick setup guide: video-guide/final-setup-guide.md
- Smithery server page (Playground + one‑click add to Cursor): https://smithery.ai/server/@Eclipse-XV/twitch-mcp-smithery
- Recommended first tests:
  - "Send a message to chat: Hello from MCP!"
  - "Create a poll titled 'Which map?' with choices 'A, B' for 60 seconds"

Note: Actions run as your broadcaster account. Test in Smithery Playground first, then use the Connect section to one‑click add to Cursor and approve.

## Overview

This MCP server allows AI agents to interact with Twitch streams through a standardized set of tools. It supports:

- Sending messages to chat
- Creating polls and predictions
- Generating clips
- Analyzing chat for trends and topics
- Moderating chat (timeout/ban users)
- Updating stream title and category

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Twitch API credentials (Client ID and OAuth token)
- Twitch channel with appropriate permissions

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```

### Configuration

You need to provide Twitch API credentials when connecting to the server. The following configuration options are required:

| Parameter | Description |
|-----------|-------------|
| `twitchClientId` | Your Twitch application client ID |
| `twitchAuthToken` | OAuth token (without 'oauth:' prefix) |
| `twitchBroadcasterId` | Your Twitch user ID |
| `twitchChannel` | Your Twitch channel name |

## Deployment on Smithery

This server is configured for easy deployment on [Smithery](https://smithery.ai).

1. Push this repository to GitHub
2. Connect your GitHub account to Smithery
3. Create a new deployment, selecting this repository
4. Configure your Twitch API credentials in the Smithery dashboard

## Available Tools

### Chat Interaction

- **sendMessageToChat**: Send a message to Twitch chat
- **getRecentChatLog**: Get the last 20 chat messages for context
- **analyzeChat**: Analyze chat for topics and activity

### Stream Management

- **createTwitchPoll**: Create a poll with multiple choices
- **createTwitchPrediction**: Create a prediction with outcomes
- **createTwitchClip**: Create a clip of the current stream
- **updateStreamTitle**: Change the stream title
- **updateStreamCategory**: Change the game/category

### Moderation

- **timeoutUser**: Timeout a user for a specified duration
- **banUser**: Permanently ban a user from chat

## Advanced Features

### Smart User Resolution

When performing moderation actions, you can provide either:

1. An exact username
2. A behavioral descriptor (e.g., "toxic", "spam")
3. A partial username match

The server will attempt to resolve the appropriate user based on chat history.

### Intelligent Timeout Duration

The timeout tool automatically suggests an appropriate duration based on the severity of the provided reason:

- Spam/excessive emotes: 5 minutes
- Toxic behavior: 30 minutes
- Severe violations: 60 minutes
- Other violations: 10 minutes (default)

## Known Issues & Limitations

### Image Description Support

While AI assistants (like Cursor/Claude) can process and describe images, there are some considerations when using this with the Twitch MCP server:

- **Image processing**: Image analysis is handled by the AI client, not the MCP server itself
- **Message length**: AI-generated descriptions can be quite long. Twitch chat has a 500 character limit per message
- **Auto-truncation**: The `sendMessageToChat` tool now automatically truncates messages that exceed 500 characters and notifies you when this happens
- **Workaround**: For detailed image descriptions, consider asking the AI to provide a shorter summary suitable for chat

### Other Considerations

- **API Rate Limits**: Twitch API has rate limits that may affect rapid successive calls
- **Permissions**: Ensure your Twitch token has the necessary scopes for all desired features
- **Stream Status**: Some tools (like creating clips) require an active stream

## License

ISC

## Credits

Based on the original Java implementation of Twitch-MCP.
