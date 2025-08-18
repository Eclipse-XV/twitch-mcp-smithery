import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "tmi.js";
import { AutonomousMonitor } from "./autonomous-monitor.js";
import { AutonomousConfig, ChatMessage as AutonomousChatMessage } from "./autonomous-types.js";

// Configuration schema for Twitch API credentials and autonomous features
export const configSchema = z.object({
  debug: z.boolean().default(false).describe("Enable debug logging"),
  twitchClientId: z.string().describe("Twitch Client ID for API access"),
  twitchAuthToken: z.string().describe("Twitch OAuth token (without 'oauth:' prefix)"),
  twitchBroadcasterId: z.string().describe("Twitch broadcaster user ID"),
  twitchChannel: z.string().describe("Twitch channel name for chat monitoring"),
  
  // Autonomous monitoring configuration
  autonomous: z.object({
    enabled: z.boolean().default(false).describe("Enable autonomous chat monitoring"),
    monitoringInterval: z.number().default(30000).describe("Chat analysis interval in milliseconds"),
    feedbackDir: z.string().default("./autonomous-feedback").describe("Directory for feedback and learning data"),
    maxFeedbackRetentionDays: z.number().default(30).describe("Days to keep feedback files"),
    
    rules: z.object({
      spamDetection: z.object({
        enabled: z.boolean().default(true).describe("Enable spam detection"),
        threshold: z.number().default(5).describe("Messages per minute threshold"),
        action: z.enum(['timeout', 'ban', 'warn']).default('timeout').describe("Action to take"),
        duration: z.number().default(300).optional().describe("Timeout duration in seconds")
      }),
      
      toxicityDetection: z.object({
        enabled: z.boolean().default(true).describe("Enable toxicity detection"),
        severityThreshold: z.number().default(6).describe("Minimum severity (1-10) to trigger action"),
        action: z.enum(['timeout', 'ban', 'warn']).default('timeout').describe("Action to take"),
        duration: z.number().default(1800).optional().describe("Timeout duration in seconds")
      }),
      
      chatEngagement: z.object({
        enabled: z.boolean().default(true).describe("Enable chat engagement"),
        quietPeriodThreshold: z.number().default(10).describe("Minutes of quiet before engagement"),
        responses: z.array(z.string()).default([
          "How's everyone doing today?",
          "What would you like to see next?",
          "Thanks for hanging out in chat!",
          "Any questions about what we're doing?"
        ]).describe("Pool of engagement messages")
      }),
      
      pollAutomation: z.object({
        enabled: z.boolean().default(false).describe("Enable automatic poll creation"),
        trigger: z.enum(['viewerRequest', 'scheduled', 'gameEvent']).default('viewerRequest').describe("When to trigger polls"),
        cooldown: z.number().default(30).describe("Minutes between polls")
      })
    })
  }).optional().describe("Autonomous monitoring configuration")
});

// Types for API responses and data structures
interface ChatMessage {
  username: string;
  content: string;
  timestamp: Date;
}

interface TwitchApiError {
  error: string;
  status: number;
  message: string;
}

// Descriptor keywords for moderation targeting
const DESCRIPTOR_KEYWORDS = {
  toxic: ["idiot", "stupid", "hate", "kill", "dumb", "trash", "noob", "loser", "shut up", "annoying", "toxic", "rude", "mean", "sucks", "bad", "worst", "report", "ban"],
  spam: ["buy followers", "free", "promo", "visit", "http", "www", "spam", "emote", "caps", "repeated"],
  rude: ["shut up", "idiot", "stupid", "dumb", "annoying", "rude", "mean", "trash", "loser", "bad", "worst"]
};

// Common words to filter out from chat analysis
const COMMON_WORDS = new Set([
  "the", "and", "that", "have", "for", "not", "with", "you", "this", "but",
  "his", "from", "they", "say", "her", "she", "will", "one", "all", "would",
  "there", "their", "what", "so", "up", "out", "if", "about", "who", "get",
  "which", "go", "me", "when", "make", "can", "like", "time", "no", "just",
  "him", "know", "take", "people", "into", "year", "your", "good", "some",
  "could", "them", "see", "other", "than", "then", "now", "look", "only",
  "come", "its", "over", "think", "also", "back", "after", "use", "two",
  "how", "our", "work", "first", "well", "way", "even", "new", "want",
  "because", "any", "these", "give", "day", "most", "us"
]);

export default function createStatelessServer({
  config,
}: {
  config: z.infer<typeof configSchema>;
}) {
  const server = new McpServer({
    name: "Twitch MCP Server",
    version: "1.0.0",
  });

  // In-memory chat message storage (in production, you might want to use a database)
  let recentMessages: ChatMessage[] = [];
  const MAX_MESSAGES = 100;

  // Initialize Twitch IRC client
  const tmiClient = new Client({
    options: { debug: config.debug },
    connection: {
      secure: true,
      reconnect: true,
    },
    identity: {
      username: config.twitchChannel,
      password: `oauth:${config.twitchAuthToken}`
    },
    channels: [`#${config.twitchChannel}`]
  });

  // Connect to Twitch IRC
  let ircConnected = false;
  tmiClient.connect().then(() => {
    ircConnected = true;
    if (config.debug) {
      console.log('Connected to Twitch IRC');
    }
  }).catch((error) => {
    console.error('Failed to connect to Twitch IRC:', error);
  });

  // Listen for incoming chat messages and add them to our log
  tmiClient.on('message', (channel, tags, message, self) => {
    if (!self) { // Don't log our own messages
      addChatMessage(tags.username || 'unknown', message);
    }
  });

  // Function to ensure IRC connection is ready
  async function ensureIrcConnection(): Promise<boolean> {
    if (ircConnected) {
      return true;
    }
    
    try {
      await tmiClient.connect();
      ircConnected = true;
      return true;
    } catch (error) {
      console.error('Failed to establish IRC connection:', error);
      return false;
    }
  }

  // Utility function to make Twitch API calls
  async function makeTwitchApiCall(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', 
    body?: any
  ): Promise<any> {
    const url = `https://api.twitch.tv/helix${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${config.twitchAuthToken}`,
      'Client-Id': config.twitchClientId,
      'Content-Type': 'application/json'
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw {
          error: 'API_ERROR',
          status: response.status,
          message: errorText || `HTTP ${response.status}`
        } as TwitchApiError;
      }

      if (response.status === 204) {
        return { success: true }; // No content response
      }

      return await response.json();
    } catch (error) {
      if (error.error) {
        throw error; // Re-throw our formatted error
      }
      throw {
        error: 'NETWORK_ERROR', 
        status: 0, 
        message: error.message || 'Network request failed'
      } as TwitchApiError;
    }
  }

  // Get user ID from username
  async function getUserIdFromUsername(username: string): Promise<string | null> {
    try {
      const response = await makeTwitchApiCall(`/users?login=${encodeURIComponent(username)}`);
      return response.data?.[0]?.id || null;
    } catch {
      return null;
    }
  }

  // Add a simulated chat message (in production, this would be from IRC/WebSocket)
  function addChatMessage(username: string, content: string) {
    const message: ChatMessage = {
      username,
      content,
      timestamp: new Date()
    };
    
    recentMessages.push(message);
    if (recentMessages.length > MAX_MESSAGES) {
      recentMessages.shift();
    }
  }

  // Analyze recent chat messages
  function analyzeChat(): string {
    if (recentMessages.length === 0) {
      return "No recent chat messages to analyze.";
    }

    const wordFrequency = new Map<string, number>();
    let totalWords = 0;

    for (const message of recentMessages) {
      const words = message.content.toLowerCase().split(/\s+/);
      totalWords += words.length;
      
      for (const word of words) {
        if (word.length > 3 && !COMMON_WORDS.has(word)) {
          wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
        }
      }
    }

    const topWords = Array.from(wordFrequency.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word, count]) => `${word} (${count} mentions)`);

    const avgWordsPerMessage = (totalWords / recentMessages.length).toFixed(1);
    
    return `Chat Analysis:\n- Total messages: ${recentMessages.length}\n- Average words per message: ${avgWordsPerMessage}\n- Top topics: ${topWords.length > 0 ? topWords.join(', ') : 'No significant topics detected'}`;
  }

  // Find user by descriptor (toxic, spam, etc.) or partial name
  function findUserByDescriptor(descriptor: string): string | null {
    const keywords = DESCRIPTOR_KEYWORDS[descriptor.toLowerCase() as keyof typeof DESCRIPTOR_KEYWORDS] || [descriptor];
    const userScores = new Map<string, number>();

    for (const message of recentMessages) {
      const content = message.content.toLowerCase();
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          userScores.set(message.username, (userScores.get(message.username) || 0) + 1);
        }
      }
    }

    if (userScores.size === 0) return null;
    
    return Array.from(userScores.entries())
      .sort(([,a], [,b]) => b - a)[0][0];
  }

  // Resolve moderation target
  function resolveModerationTarget(input: string): string | null {
    if (!input?.trim()) return null;
    
    const lowered = input.toLowerCase();
    // Check for explicit username patterns
    if (lowered.includes("user named") || /^[a-zA-Z0-9_]{3,25}$/.test(input.trim())) {
      const username = input.replace(/.*user named\s+/, "").trim();
      // Try to find in recent messages
      const found = recentMessages.find(m => m.username.toLowerCase().includes(username.toLowerCase()));
      return found?.username || username;
    }
    
    return null; // Let LLM review chat log
  }

  // Guess timeout duration based on reason
  function guessTimeoutDuration(reason: string): number {
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes("spam") || lowerReason.includes("caps") || lowerReason.includes("emote")) {
      return 300; // 5 minutes
    } else if (lowerReason.includes("toxic") || lowerReason.includes("rude") || lowerReason.includes("mean")) {
      return 1800; // 30 minutes
    } else if (lowerReason.includes("severe") || lowerReason.includes("serious")) {
      return 3600; // 1 hour
    }
    return 600; // Default 10 minutes
  }

  // Get recent chat log as formatted strings
  function getRecentChatLog(n: number = 20): string[] {
    const messages = recentMessages.slice(-n);
    return messages.map(m => `${m.username}: ${m.content}`);
  }

  // Tool: Send message to Twitch chat
  server.tool(
    "sendMessageToChat",
    "Send message to the Twitch Chat",
    {
      message: z.string().describe("The message to send to chat")
    },
    async ({ message }) => {
      try {
        // Ensure IRC connection is ready
        const connected = await ensureIrcConnection();
        if (!connected) {
          return {
            content: [{ type: "text", text: `Failed to send message: IRC connection not available` }]
          };
        }

        // Send the message to Twitch chat via IRC
        await tmiClient.say(`#${config.twitchChannel}`, message);
        
        // Add to our local message log for analysis
        addChatMessage(config.twitchChannel, `[BOT] ${message}`);
        
        return {
          content: [{ type: "text", text: `Successfully sent message to Twitch chat: ${message}` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: "text", text: `Failed to send message: ${errorMessage}` }]
        };
      }
    }
  );

  // Tool: Create Twitch Poll
  server.tool(
    "createTwitchPoll",
    "Create a Twitch Poll",
    {
      title: z.string().describe("Poll title"),
      choices: z.string().describe("Comma-separated choices"),
      duration: z.number().int().describe("Duration in seconds")
    },
    async ({ title, choices, duration }) => {
      try {
        const choicesArray = choices.split(',').map(c => ({ title: c.trim() }));
        
        const response = await makeTwitchApiCall('/polls', 'POST', {
          broadcaster_id: config.twitchBroadcasterId,
          title,
          choices: choicesArray,
          duration
        });

        return {
          content: [{ type: "text", text: "Poll created successfully!" }]
        };
      } catch (error) {
        const err = error as TwitchApiError;
        return {
          content: [{ type: "text", text: `Error creating poll: ${err.message}` }]
        };
      }
    }
  );

  // Tool: Create Twitch Prediction
  server.tool(
    "createTwitchPrediction",
    "Create a Twitch Prediction",
    {
      title: z.string().describe("Prediction title"),
      outcomes: z.string().describe("Comma-separated outcomes"),
      duration: z.number().int().describe("Duration in seconds")
    },
    async ({ title, outcomes, duration }) => {
      try {
        const outcomesArray = outcomes.split(',').map(o => ({ title: o.trim() }));
        
        const response = await makeTwitchApiCall('/predictions', 'POST', {
          broadcaster_id: config.twitchBroadcasterId,
          title,
          outcomes: outcomesArray,
          prediction_window: duration
        });

        return {
          content: [{ type: "text", text: "Prediction created successfully!" }]
        };
      } catch (error) {
        const err = error as TwitchApiError;
        return {
          content: [{ type: "text", text: `Error creating prediction: ${err.message}` }]
        };
      }
    }
  );

  // Tool: Create Twitch Clip
  server.tool(
    "createTwitchClip",
    "Create a Twitch clip of the current stream",
    {},
    async () => {
      try {
        const response = await makeTwitchApiCall(`/clips?broadcaster_id=${config.twitchBroadcasterId}`, 'POST');
        
        const editUrl = response.data?.[0]?.edit_url;
        const clipUrl = editUrl ? `Clip created successfully! You can view it at: ${editUrl}` : "Clip created successfully!";
        
        return {
          content: [{ type: "text", text: clipUrl }]
        };
      } catch (error) {
        const err = error as TwitchApiError;
        return {
          content: [{ type: "text", text: `Error creating clip: ${err.message}` }]
        };
      }
    }
  );

  // Tool: Analyze Chat
  server.tool(
    "analyzeChat",
    "Analyze recent Twitch chat messages and provide a summary of topics and activity",
    {},
    async () => {
      const analysis = analyzeChat();
      return {
        content: [{ type: "text", text: analysis }]
      };
    }
  );

  // Tool: Get Recent Chat Log
  server.tool(
    "getRecentChatLog",
    "Get the last 20 chat messages for moderation context",
    {},
    async () => {
      const log = getRecentChatLog(20);
      if (log.length === 0) {
        return {
          content: [{ type: "text", text: "No recent chat messages available." }]
        };
      }
      return {
        content: [{ type: "text", text: log.join('\n') }]
      };
    }
  );

  // Tool: Timeout User
  server.tool(
    "timeoutUser",
    "Timeout a user in the Twitch chat. If no username is provided, it will return the recent chat log for LLM review.",
    {
      usernameOrDescriptor: z.string().describe("Username or descriptor to timeout (e.g. 'toxic', 'spammer', or a username)"),
      reason: z.string().optional().describe("Reason for timeout (optional)")
    },
    async ({ usernameOrDescriptor, reason }) => {
      try {
        const targetUser = resolveModerationTarget(usernameOrDescriptor);
        
        if (!targetUser) {
          const log = getRecentChatLog(20);
          return {
            content: [{ type: "text", text: `No explicit username provided. Here are the last 20 chat messages:\n${log.join('\n')}` }]
          };
        }

        const userId = await getUserIdFromUsername(targetUser);
        if (!userId) {
          return {
            content: [{ type: "text", text: `Could not resolve user ID for username: ${targetUser}` }]
          };
        }

        const timeoutReason = reason || "inappropriate behavior";
        const duration = guessTimeoutDuration(timeoutReason);
        
        await makeTwitchApiCall('/moderation/bans', 'POST', {
          broadcaster_id: config.twitchBroadcasterId,
          moderator_id: config.twitchBroadcasterId,
          data: {
            user_id: userId,
            reason: timeoutReason,
            duration
          }
        });

        return {
          content: [{ type: "text", text: `Successfully timed out ${targetUser} for ${duration} seconds. Reason: ${timeoutReason}` }]
        };
      } catch (error) {
        const err = error as TwitchApiError;
        return {
          content: [{ type: "text", text: `Error timing out user: ${err.message}` }]
        };
      }
    }
  );

  // Tool: Ban User
  server.tool(
    "banUser",
    "Ban a user from the Twitch chat. If no username is provided, it will return the recent chat log for LLM review.",
    {
      usernameOrDescriptor: z.string().describe("Username or descriptor to ban (e.g. 'toxic', 'spammer', or a username)"),
      reason: z.string().optional().describe("Reason for ban (optional)")
    },
    async ({ usernameOrDescriptor, reason }) => {
      try {
        const targetUser = resolveModerationTarget(usernameOrDescriptor);
        
        if (!targetUser) {
          const log = getRecentChatLog(20);
          return {
            content: [{ type: "text", text: `No explicit username provided. Here are the last 20 chat messages:\n${log.join('\n')}` }]
          };
        }

        const userId = await getUserIdFromUsername(targetUser);
        if (!userId) {
          return {
            content: [{ type: "text", text: `Could not resolve user ID for username: ${targetUser}` }]
          };
        }

        const banReason = reason || "severe violation of chat rules";
        
        await makeTwitchApiCall('/moderation/bans', 'POST', {
          broadcaster_id: config.twitchBroadcasterId,
          moderator_id: config.twitchBroadcasterId,
          data: {
            user_id: userId,
            reason: banReason
          }
        });

        return {
          content: [{ type: "text", text: `Successfully banned ${targetUser}. Reason: ${banReason}` }]
        };
      } catch (error) {
        const err = error as TwitchApiError;
        return {
          content: [{ type: "text", text: `Error banning user: ${err.message}` }]
        };
      }
    }
  );

  // Tool: Update Stream Title
  server.tool(
    "updateStreamTitle",
    "Update the stream title",
    {
      title: z.string().describe("The new title for the stream")
    },
    async ({ title }) => {
      try {
        await makeTwitchApiCall('/channels', 'PATCH', {
          broadcaster_id: config.twitchBroadcasterId,
          title: title.replace(/"/g, '\\"') // Escape quotes
        });

        return {
          content: [{ type: "text", text: `Successfully updated stream title to: ${title}` }]
        };
      } catch (error) {
        const err = error as TwitchApiError;
        return {
          content: [{ type: "text", text: `Failed to update stream title: ${err.message}` }]
        };
      }
    }
  );

  // Tool: Update Stream Category
  server.tool(
    "updateStreamCategory",
    "Update the game category of the stream",
    {
      category: z.string().describe("The new game category, e.g. 'Fortnite'")
    },
    async ({ category }) => {
      try {
        // First, search for the category to get its ID
        const searchResponse = await makeTwitchApiCall(`/search/categories?query=${encodeURIComponent(category)}`);
        
        if (!searchResponse.data || searchResponse.data.length === 0) {
          return {
            content: [{ type: "text", text: `Could not find a Twitch category named '${category}'.` }]
          };
        }

        const categoryId = searchResponse.data[0].id;
        
        // Update the channel with the new game_id
        await makeTwitchApiCall('/channels', 'PATCH', {
          broadcaster_id: config.twitchBroadcasterId,
          game_id: categoryId
        });

        return {
          content: [{ type: "text", text: `Successfully updated stream category to: ${category}` }]
        };
      } catch (error) {
        const err = error as TwitchApiError;
        return {
          content: [{ type: "text", text: `Failed to update stream category: ${err.message}` }]
        };
      }
    }
  );

  // Initialize autonomous monitor if configured
  let autonomousMonitor: AutonomousMonitor | null = null;
  
  if (config.autonomous) {
    // AI analysis function for autonomous features
    const aiAnalyzeFunction = async (prompt: string): Promise<string> => {
      // This is a placeholder - in a real implementation, this would call
      // an AI service like OpenAI, Claude, etc.
      // For now, return a simple analysis
      return JSON.stringify({
        analysis: "AI analysis placeholder",
        confidence: 0.5,
        recommendation: "Monitor situation"
      });
    };

    // MCP tool executor for autonomous actions
    const mcpToolExecutor = async (toolName: string, parameters: Record<string, any>) => {
      try {
        // Execute the tool using the server's tool handlers
        switch (toolName) {
          case 'sendMessageToChat':
            await tmiClient.say(`#${config.twitchChannel}`, parameters.message);
            addChatMessage(config.twitchChannel, `[AUTONOMOUS] ${parameters.message}`);
            return { success: true, result: 'Message sent' };
            
          case 'timeoutUser':
            const userId = await getUserIdFromUsername(parameters.usernameOrDescriptor);
            if (userId) {
              await makeTwitchApiCall('/moderation/bans', 'POST', {
                broadcaster_id: config.twitchBroadcasterId,
                moderator_id: config.twitchBroadcasterId,
                data: {
                  user_id: userId,
                  reason: parameters.reason || 'Autonomous moderation',
                  duration: 300
                }
              });
              return { success: true, result: `Timed out ${parameters.usernameOrDescriptor}` };
            }
            return { success: false, error: 'User not found' };
            
          case 'createTwitchPoll':
            const choicesArray = parameters.choices.split(',').map((c: string) => ({ title: c.trim() }));
            await makeTwitchApiCall('/polls', 'POST', {
              broadcaster_id: config.twitchBroadcasterId,
              title: parameters.title,
              choices: choicesArray,
              duration: parameters.duration
            });
            return { success: true, result: 'Poll created' };
            
          default:
            return { success: false, error: `Unknown tool: ${toolName}` };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    };

    // Initialize autonomous monitor
    autonomousMonitor = new AutonomousMonitor(
      {
        autonomous: config.autonomous,
        feedbackDir: config.autonomous.feedbackDir,
        maxFeedbackRetentionDays: config.autonomous.maxFeedbackRetentionDays
      },
      aiAnalyzeFunction,
      mcpToolExecutor
    );

    // Feed chat messages to autonomous monitor
    const originalAddChatMessage = addChatMessage;
    addChatMessage = function(username: string, content: string) {
      originalAddChatMessage(username, content);
      
      // Also feed to autonomous monitor
      if (autonomousMonitor) {
        autonomousMonitor.addChatMessages([{
          username,
          content,
          timestamp: new Date()
        }]);
      }
    };

    // Start autonomous monitoring
    if (config.autonomous.enabled) {
      autonomousMonitor.start();
    }
  }

  // AUTONOMOUS CONTROL TOOLS

  // Tool: Start Autonomous Monitoring
  server.tool(
    "startAutonomousMonitoring",
    "Start the autonomous chat monitoring system",
    {},
    async () => {
      if (!autonomousMonitor) {
        return {
          content: [{ type: "text", text: "Autonomous monitoring is not configured. Please check server configuration." }]
        };
      }

      try {
        await autonomousMonitor.start();
        return {
          content: [{ type: "text", text: "✅ Autonomous chat monitoring started successfully!" }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `❌ Failed to start autonomous monitoring: ${error instanceof Error ? error.message : 'Unknown error'}` }]
        };
      }
    }
  );

  // Tool: Stop Autonomous Monitoring
  server.tool(
    "stopAutonomousMonitoring", 
    "Stop the autonomous chat monitoring system",
    {},
    async () => {
      if (!autonomousMonitor) {
        return {
          content: [{ type: "text", text: "Autonomous monitoring is not configured." }]
        };
      }

      try {
        await autonomousMonitor.stop();
        return {
          content: [{ type: "text", text: "✅ Autonomous chat monitoring stopped successfully!" }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `❌ Failed to stop autonomous monitoring: ${error instanceof Error ? error.message : 'Unknown error'}` }]
        };
      }
    }
  );

  // Tool: Get Autonomous Status
  server.tool(
    "getAutonomousStatus",
    "Get the current status and statistics of the autonomous monitoring system",
    {},
    async () => {
      if (!autonomousMonitor) {
        return {
          content: [{ type: "text", text: "Autonomous monitoring is not configured." }]
        };
      }

      const state = autonomousMonitor.getState();
      const debugInfo = autonomousMonitor.getDebugInfo();
      
      let status = `# Autonomous Monitoring Status\n\n`;
      status += `**Active:** ${state.isActive ? '✅ Yes' : '❌ No'}\n`;
      status += `**Running:** ${debugInfo.isRunning ? '✅ Yes' : '❌ No'}\n`;
      status += `**Last Analysis:** ${state.lastAnalysis.toISOString()}\n`;
      status += `**Recent Messages:** ${debugInfo.recentMessagesCount}\n\n`;
      
      status += `## Today's Statistics\n\n`;
      status += `- **Actions Taken:** ${state.statistics.actionsToday}\n`;
      status += `- **Success Rate:** ${(state.statistics.successRate * 100).toFixed(1)}%\n`;
      status += `- **Average Confidence:** ${state.statistics.averageConfidence.toFixed(2)}\n`;
      status += `- **Most Common Action:** ${state.statistics.mostCommonAction || 'None'}\n\n`;
      
      status += `## Recent Actions\n\n`;
      if (state.recentActions.length > 0) {
        for (const action of state.recentActions.slice(-5)) {
          const timeStr = action.timestamp.toISOString().split('T')[1].split('.')[0];
          status += `- **${timeStr}**: ${action.action} (${action.reason})\n`;
        }
      } else {
        status += `No recent actions taken.\n`;
      }
      
      return {
        content: [{ type: "text", text: status }]
      };
    }
  );

  // Tool: Force Immediate Analysis
  server.tool(
    "forceAutonomousAnalysis",
    "Force an immediate chat analysis and potential action by the autonomous system",
    {},
    async () => {
      if (!autonomousMonitor) {
        return {
          content: [{ type: "text", text: "Autonomous monitoring is not configured." }]
        };
      }

      try {
        const result = await autonomousMonitor.forceAnalysis();
        
        let report = `# Forced Analysis Results\n\n`;
        report += `**Patterns Detected:** ${result.patterns.length}\n`;
        report += `**Potential Actions:** ${result.decisions.length}\n`;
        report += `**Actions Executed:** ${result.executed.length}\n\n`;
        
        if (result.executed.length > 0) {
          report += `## Actions Taken\n\n`;
          for (const action of result.executed) {
            report += `- **${action.action}**: ${action.reason} (Confidence: ${action.confidence})\n`;
          }
        }
        
        if (result.patterns.length > 0) {
          report += `\n## Patterns Detected\n\n`;
          for (const pattern of result.patterns) {
            report += `- **${pattern.type}**: Severity ${pattern.severity}/10, Confidence ${pattern.confidence}\n`;
          }
        }
        
        return {
          content: [{ type: "text", text: report }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}` }]
        };
      }
    }
  );

  // Tool: Add User Feedback
  server.tool(
    "addUserFeedbackToAutonomous",
    "Provide feedback on an autonomous action to help improve the system",
    {
      rating: z.number().int().min(1).max(5).describe("Rating from 1 (poor) to 5 (excellent)"),
      comment: z.string().optional().describe("Optional comment about the action")
    },
    async ({ rating, comment }) => {
      if (!autonomousMonitor) {
        return {
          content: [{ type: "text", text: "Autonomous monitoring is not configured." }]
        };
      }

      // Find the most recent action (within last 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const state = autonomousMonitor.getState();
      const recentAction = state.recentActions
        .filter(a => a.timestamp >= tenMinutesAgo)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
      
      if (!recentAction) {
        return {
          content: [{ type: "text", text: "No recent autonomous actions found to provide feedback on." }]
        };
      }

      try {
        const success = await autonomousMonitor.addUserFeedback(
          recentAction.timestamp,
          rating as 1 | 2 | 3 | 4 | 5,
          comment,
          'manual'
        );

        if (success) {
          return {
            content: [{ type: "text", text: `✅ Thank you! Feedback recorded for action: ${recentAction.action}\nRating: ${rating}/5${comment ? `\nComment: ${comment}` : ''}` }]
          };
        } else {
          return {
            content: [{ type: "text", text: "❌ Failed to record feedback. Action may be too old." }]
          };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `❌ Error recording feedback: ${error instanceof Error ? error.message : 'Unknown error'}` }]
        };
      }
    }
  );

  // Tool: Generate Performance Report
  server.tool(
    "generateAutonomousReport",
    "Generate a comprehensive performance report for the autonomous monitoring system",
    {},
    async () => {
      if (!autonomousMonitor) {
        return {
          content: [{ type: "text", text: "Autonomous monitoring is not configured." }]
        };
      }

      try {
        const report = await autonomousMonitor.generatePerformanceReport();
        return {
          content: [{ type: "text", text: report }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `❌ Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}` }]
        };
      }
    }
  );

  return server.server;
}
