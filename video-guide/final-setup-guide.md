# Twitch MCP Server Setup (Smithery → Cursor)

Goal: Get streamers from zero to “sending a chat message” or “creating a poll” in minutes using Smithery, then one‑click install to Cursor.

What you’ll do
- Generate a Twitch access token (no need to register a Twitch app manually)
- Collect your Twitch Broadcaster ID and Channel name
- Add credentials on Smithery
- Test in Smithery Playground (send a message or create a poll)
- One‑click add the server to Cursor and approve it

Required items
- Twitch account with streaming permissions (your broadcaster account)
- Twitch channel name (your Twitch username)
- Twitch access token with scopes below
- Twitch Broadcaster ID (numeric)
- An MCP client — we recommend Cursor (free, GUI; avoids scary CLI)

Step 1 — Generate your Twitch access token (no app registration required)
1) Open https://twitchtokengenerator.com
2) Select these scopes:
   - channel:manage:polls
   - channel:manage:predictions
   - channel:manage:broadcast
   - clips:edit
   - chat:read
   - chat:edit
   - moderator:manage:banned_users
   - moderator:read:chatters
3) Generate token and copy:
   - Client ID
   - Access Token (do NOT include the 'oauth:' prefix)

Step 2 — Get your Broadcaster ID (numeric)
- Open https://streamweasels.com/tools/convert-twitch-username-to-user-id
- Enter your Twitch username and copy the numeric User ID (this is your Broadcaster ID)
- Note your Channel name (same as your Twitch username)

Step 3 — Configure on Smithery
1) Go to: https://smithery.ai/server/@Eclipse-XV/twitch-mcp-smithery
2) Click “Add configuration” and enter:
   - Twitch Client ID: your Client ID from the token generator
   - Twitch Auth Token: your Access Token (without 'oauth:')
   - Twitch Broadcaster ID: your numeric User ID
   - Twitch Channel: your channel name (username)
3) Save

Step 4 — Test in Smithery Playground (recommended)
1) On the same Smithery page, click “Try in Playground”
2) In the task box, try one of these to validate everything quickly:
   - Send a test chat message: “Send a message to chat: Hello from MCP!”
   - Create a test poll: “Create a poll titled ‘Which map?’ with choices ‘A, B’ for 60 seconds”
3) Confirm success. If there’s an error, check token scopes and values.

Step 5 — One‑click add to Cursor
1) Back on the Smithery server page, find the “Connect” section
2) Click “Get connection URL”, then under “Or add to your client” choose “Auto”
3) Click “Cursor” in the client list
4) Approve the connection in Cursor when it opens
5) In Cursor chat, run the same quick test you used in Playground (message or poll)

You’re ready to use
- sendMessageToChat — send messages live
- createTwitchPoll — create polls
- createTwitchPrediction — create predictions
- timeoutUser / banUser — moderate chat
- createTwitchClip — clip moments
- updateStreamTitle / updateStreamCategory — manage stream

Notes
- Username vs User ID: For reliability, the server currently asks for both channel name and Broadcaster ID. Auto‑lookup could be added later, but this ensures fewer edge‑case failures during moderation.
- Keep your token private. If compromised, regenerate it and update Smithery.
- If a client doesn’t support OAuth, use “Get URL with keys instead” on Smithery.

Common fixes
- “Unauthorized” or missing permissions: Regenerate token with all scopes above
- Nothing appears in chat: Verify you’re connected to the correct channel name

