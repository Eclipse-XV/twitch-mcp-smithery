# Twitch MCP Server Video Outline (Final)

Audience
- Streamers comfortable with OBS, new to AI tooling
- Goal: Up and running quickly with minimal steps

Total runtime: ~12–15 minutes

1) Hook (0:30)
- “Want predictions, polls, and moderation handled in seconds—all from a chat with your AI?”
- Quick 10-second montage: create poll → timeout toxic chatter → update title

2) What we’ll do today (0:30)
- Generate a Twitch token (no app registration)
- Configure credentials on Smithery
- Test in Smithery Playground
- One‑click “Add to Cursor,” approve, and run live actions

3) Prereqs (0:30)
- Twitch account (you’re the broadcaster)
- Your Twitch channel name

4) Get credentials (2:00)
- Open twitchtokengenerator.com
  - Select scopes: channel:manage:polls, channel:manage:predictions, channel:manage:broadcast, clips:edit, chat:read, chat:edit, moderator:manage:banned_users, moderator:read:chatters
  - Copy Client ID & Access Token (without ‘oauth:’)
- Convert username → ID on streamweasels.com
  - Copy numeric User ID (Broadcaster ID)

5) Configure on Smithery (1:30)
- Navigate to: smithery.ai/server/@Eclipse-XV/twitch-mcp-smithery
- Click “Add configuration” and paste:
  - Client ID
  - Access Token (no ‘oauth:’ prefix)
  - Broadcaster ID (numeric)
  - Channel name (username)
- Save

6) Test in Smithery Playground (best quick validation) (2:00)
- Click “Try in Playground”
- In the task input, start with an action that shows immediate results:
  - Option A (fastest visual): “Send a message to chat: Hello from MCP!”
  - Option B: “Create a poll titled ‘Which map?’ with choices ‘A, B’ for 60 seconds”
- Show the success result and what it looks like if scopes/values are wrong (briefly)

7) One‑click add to Cursor (2:00)
- Back on the Smithery server page, under Connect → “Or add to your client” → Auto
- Click “Cursor” → Cursor opens
- Approve the connection in Cursor
- In Cursor chat: rerun the same test you just did in Playground (message or poll)
- Confirm success

8) Feature tour (quick hits) (3:00)
- createTwitchPrediction: “Create a prediction: Will we beat the boss? Options: Yes, No. Duration: 120 seconds”
- timeoutUser: “Timeout that toxic user for rude behavior” (explain smart resolution and duration guessing)
- createTwitchClip: “Create a clip of that last moment”
- updateStreamTitle / updateStreamCategory: “Update stream title to ‘Boss Rush Challenge’” / “Change category to Elden Ring”

9) Troubleshooting (1:00)
- Unauthorized or permission error → regenerate token with all scopes
- Message doesn’t appear → verify channel name and you’re live in the right place
- Connection issues → try “Get URL with keys instead” fallback on Smithery

10) Wrap‑up & CTA (0:30)
- Recap: Smithery config → Playground test → one‑click to Cursor → run tools live
- Ask for feedback/feature requests; suggest subscribing for updates

On‑screen text moments (B‑roll / overlays)
- “Use your broadcaster account — actions run as you”
- “Test first in Playground with a message or a poll”
- “One‑click Add to Cursor → Approve → Done”

Script prompts you can paste during recording
- “Send a message to chat: Hello from MCP!”
- “Create a poll titled ‘Which map?’ with choices ‘A, B’ for 60 seconds”
- “Create a prediction: Will we beat the boss? Options: Yes, No. Duration: 120 seconds”
- “Timeout that toxic person for rude behavior”
- “Create a clip of that last moment”
- “Update stream title to ‘Boss Rush Challenge – Can We Do It?’”
- “Change category to Elden Ring”

