import { 
  ChatPattern, 
  ActionDecision, 
  AutonomousConfig, 
  ChatAnalysisResult 
} from './autonomous-types.js';
import { AIAnalysisFunction } from './pattern-analyzer.js';

// Available MCP tools and their parameters
interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  riskLevel: 'low' | 'medium' | 'high';
  cooldown?: number; // minutes
}

const AVAILABLE_MCP_TOOLS: MCPTool[] = [
  {
    name: 'sendMessageToChat',
    description: 'Send a message to the Twitch chat',
    parameters: {
      message: { type: 'string', description: 'The message to send to chat', required: true }
    },
    riskLevel: 'low'
  },
  {
    name: 'timeoutUser',
    description: 'Timeout a user in the Twitch chat',
    parameters: {
      usernameOrDescriptor: { type: 'string', description: 'Username to timeout', required: true },
      reason: { type: 'string', description: 'Reason for timeout' }
    },
    riskLevel: 'high',
    cooldown: 1
  },
  {
    name: 'banUser',
    description: 'Permanently ban a user from the Twitch chat',
    parameters: {
      usernameOrDescriptor: { type: 'string', description: 'Username to ban', required: true },
      reason: { type: 'string', description: 'Reason for ban' }
    },
    riskLevel: 'high',
    cooldown: 5
  },
  {
    name: 'createTwitchPoll',
    description: 'Create a poll for viewers to participate in',
    parameters: {
      title: { type: 'string', description: 'Poll title', required: true },
      choices: { type: 'string', description: 'Comma-separated choices', required: true },
      duration: { type: 'number', description: 'Duration in seconds', required: true }
    },
    riskLevel: 'medium',
    cooldown: 15
  },
  {
    name: 'createTwitchPrediction',
    description: 'Create a prediction for viewers to bet on',
    parameters: {
      title: { type: 'string', description: 'Prediction title', required: true },
      outcomes: { type: 'string', description: 'Comma-separated outcomes', required: true },
      duration: { type: 'number', description: 'Duration in seconds', required: true }
    },
    riskLevel: 'medium',
    cooldown: 20
  },
  {
    name: 'createTwitchClip',
    description: 'Create a clip of the current stream moment',
    parameters: {},
    riskLevel: 'low',
    cooldown: 5
  },
  {
    name: 'updateStreamTitle',
    description: 'Update the stream title',
    parameters: {
      title: { type: 'string', description: 'The new stream title', required: true }
    },
    riskLevel: 'medium',
    cooldown: 30
  },
  {
    name: 'updateStreamCategory',
    description: 'Update the stream game category',
    parameters: {
      category: { type: 'string', description: 'The new game category', required: true }
    },
    riskLevel: 'medium',
    cooldown: 30
  }
];

const DECISION_PROMPTS = {
  actionSelection: (analysis: ChatAnalysisResult, availableTools: MCPTool[], config: AutonomousConfig) => `
You are an autonomous Twitch chat management AI. Based on the chat analysis, decide what actions to take using available MCP tools.

CHAT ANALYSIS:
- Overall Sentiment: ${analysis.overallSentiment} (-1 to 1 scale)
- Activity Level: ${analysis.activityLevel} (0-10 scale)
- Needs Attention: ${analysis.needsAttention}
- Recommendations: ${analysis.recommendations.join(', ')}

DETECTED PATTERNS:
${analysis.patterns.map(p => `
- Type: ${p.type}
- Severity: ${p.severity}/10
- Confidence: ${p.confidence}
- Users: ${p.users.join(', ')}
- Messages: ${p.messages.join(' | ')}
- AI Reason: ${p.metadata?.reason || 'N/A'}
- AI Recommendation: ${p.metadata?.recommendedAction || p.metadata?.suggestedResponse || 'N/A'}
`).join('\n')}

AVAILABLE MCP TOOLS:
${availableTools.map(tool => `
- ${tool.name}: ${tool.description} (Risk: ${tool.riskLevel})
  Parameters: ${Object.entries(tool.parameters).map(([key, param]) => 
    `${key}: ${param.description}`
  ).join(', ')}
`).join('\n')}

CONFIGURATION:
- Spam Detection: ${config.rules.spamDetection.enabled ? 'Enabled' : 'Disabled'} (Action: ${config.rules.spamDetection.action})
- Toxicity Detection: ${config.rules.toxicityDetection.enabled ? 'Enabled' : 'Disabled'} (Action: ${config.rules.toxicityDetection.action})
- Chat Engagement: ${config.rules.chatEngagement.enabled ? 'Enabled' : 'Disabled'}
- Poll Automation: ${config.rules.pollAutomation.enabled ? 'Enabled' : 'Disabled'}

DECISION CRITERIA:
- Only take action if patterns have high confidence (>0.6) and appropriate severity
- Prioritize moderation for toxicity/spam patterns
- Consider engagement opportunities for positive interactions
- Be conservative with high-risk actions (timeouts/bans)
- Don't create multiple polls/predictions in short succession
- Match actions to pattern severity and configuration settings

Respond with JSON array of actions to take (can be empty if no action needed):
[{
  "action": "toolName",
  "parameters": {"param1": "value1"},
  "reason": "Detailed explanation of why this action was chosen",
  "confidence": 0.8,
  "targetPattern": "toxicity|spam|question|etc"
}]
`,

  parameterGeneration: (action: string, pattern: ChatPattern, context: string) => `
You are generating parameters for the MCP tool "${action}" based on detected chat pattern.

PATTERN DETAILS:
- Type: ${pattern.type}
- Severity: ${pattern.severity}/10
- Users: ${pattern.users.join(', ')}
- Messages: ${pattern.messages.join(' | ')}
- AI Analysis: ${pattern.metadata?.reason || 'N/A'}
- AI Suggestion: ${pattern.metadata?.recommendedAction || pattern.metadata?.suggestedResponse || 'N/A'}

CONTEXT: ${context}

Generate appropriate parameters for the "${action}" action. Be specific and contextual.

Examples:
- For timeoutUser: Use specific username and clear reason
- For sendMessageToChat: Create engaging, relevant message that addresses the situation
- For createTwitchPoll: Generate relevant poll based on context/conversation
- For banUser: Only for severe violations, use specific username and detailed reason

Respond with JSON object containing the parameters:
{"parameter_name": "parameter_value"}
`
};

export class AIDecisionEngine {
  private aiAnalyze: AIAnalysisFunction;
  private recentActions: Map<string, Date> = new Map(); // Track cooldowns
  private config: AutonomousConfig;

  constructor(aiAnalyzeFunction: AIAnalysisFunction, config: AutonomousConfig) {
    this.aiAnalyze = aiAnalyzeFunction;
    this.config = config;
  }

  /**
   * Make autonomous decisions based on chat analysis
   */
  async makeDecisions(analysis: ChatAnalysisResult): Promise<ActionDecision[]> {
    try {
      // Filter available tools based on cooldowns and config
      const availableTools = this.getAvailableTools();
      
      if (availableTools.length === 0) {
        return []; // No tools available due to cooldowns
      }

      // Use AI to decide what actions to take
      const decisions = await this.getAIDecisions(analysis, availableTools);
      
      // Update cooldown tracking
      this.updateCooldowns(decisions);
      
      return decisions;

    } catch (error) {
      console.error('Decision engine failed:', error);
      return this.fallbackDecisions(analysis);
    }
  }

  /**
   * Use AI to make action decisions
   */
  private async getAIDecisions(analysis: ChatAnalysisResult, availableTools: MCPTool[]): Promise<ActionDecision[]> {
    const prompt = DECISION_PROMPTS.actionSelection(analysis, availableTools, this.config);
    const response = await this.aiAnalyze(prompt);
    
    let rawDecisions: any[];
    try {
      rawDecisions = JSON.parse(response);
    } catch {
      console.error('Failed to parse AI decision response');
      return [];
    }

    if (!Array.isArray(rawDecisions)) {
      return [];
    }

    // Process each decision and generate detailed parameters
    const decisions: ActionDecision[] = [];
    
    for (const decision of rawDecisions) {
      if (!decision.action || !decision.reason) continue;

      // Find the matching pattern for this decision
      const targetPattern = analysis.patterns.find(p => 
        p.type === decision.targetPattern || 
        (decision.targetPattern === 'question' && p.type === 'question') ||
        (decision.targetPattern === 'toxicity' && p.type === 'toxicity') ||
        (decision.targetPattern === 'spam' && p.type === 'spam')
      );

      if (!targetPattern && decision.targetPattern) {
        continue; // Skip if we can't find the referenced pattern
      }

      // Generate detailed parameters using AI if needed
      let parameters = decision.parameters || {};
      
      if (targetPattern && this.needsParameterGeneration(decision.action)) {
        const generatedParams = await this.generateParameters(
          decision.action, 
          targetPattern, 
          this.getContextForPattern(targetPattern, analysis)
        );
        parameters = { ...parameters, ...generatedParams };
      }

      decisions.push({
        action: decision.action,
        parameters,
        reason: decision.reason,
        confidence: decision.confidence || 0.7,
        patterns: targetPattern ? [targetPattern] : [],
        timestamp: new Date()
      });
    }

    return decisions;
  }

  /**
   * Generate parameters for an action using AI
   */
  private async generateParameters(action: string, pattern: ChatPattern, context: string): Promise<Record<string, any>> {
    const prompt = DECISION_PROMPTS.parameterGeneration(action, pattern, context);
    
    try {
      const response = await this.aiAnalyze(prompt);
      return JSON.parse(response);
    } catch {
      // Return fallback parameters
      return this.getFallbackParameters(action, pattern);
    }
  }

  /**
   * Get fallback parameters if AI generation fails
   */
  private getFallbackParameters(action: string, pattern: ChatPattern): Record<string, any> {
    const user = pattern.users[0] || 'unknown';
    const message = pattern.messages[0] || '';
    
    switch (action) {
      case 'timeoutUser':
        return {
          usernameOrDescriptor: user,
          reason: `${pattern.type} behavior detected`
        };
      case 'banUser':
        return {
          usernameOrDescriptor: user,
          reason: `Severe ${pattern.type} violation`
        };
      case 'sendMessageToChat':
        if (pattern.type === 'question') {
          return { message: "Thanks for the question! Let me think about that..." };
        } else if (pattern.type === 'quiet') {
          return { message: "How's everyone doing? What would you like to see next?" };
        }
        return { message: "Thanks for being part of the chat!" };
      case 'createTwitchPoll':
        return {
          title: "What should we do next?",
          choices: "Option A, Option B, Option C",
          duration: 300
        };
      default:
        return {};
    }
  }

  /**
   * Check if an action needs AI parameter generation
   */
  private needsParameterGeneration(action: string): boolean {
    return ['sendMessageToChat', 'createTwitchPoll', 'createTwitchPrediction', 'updateStreamTitle'].includes(action);
  }

  /**
   * Get context information for a pattern
   */
  private getContextForPattern(pattern: ChatPattern, analysis: ChatAnalysisResult): string {
    const contexts = [
      `Overall chat sentiment: ${analysis.overallSentiment > 0 ? 'positive' : analysis.overallSentiment < 0 ? 'negative' : 'neutral'}`,
      `Activity level: ${analysis.activityLevel}/10`,
      `Pattern confidence: ${pattern.confidence}`,
      `Severity: ${pattern.severity}/10`
    ];

    if (pattern.metadata?.aiGenerated) {
      contexts.push(`AI detected: ${pattern.metadata.reason}`);
    }

    return contexts.join(', ');
  }

  /**
   * Get tools that are available (not on cooldown)
   */
  private getAvailableTools(): MCPTool[] {
    const now = new Date();
    
    return AVAILABLE_MCP_TOOLS.filter(tool => {
      const lastUsed = this.recentActions.get(tool.name);
      if (!lastUsed || !tool.cooldown) return true;
      
      const cooldownMs = tool.cooldown * 60 * 1000;
      return (now.getTime() - lastUsed.getTime()) >= cooldownMs;
    }).filter(tool => {
      // Filter based on configuration
      if (tool.riskLevel === 'high' && !this.config.enabled) return false;
      
      if (tool.name === 'timeoutUser' || tool.name === 'banUser') {
        return this.config.rules.spamDetection.enabled || this.config.rules.toxicityDetection.enabled;
      }
      
      if (tool.name === 'createTwitchPoll') {
        return this.config.rules.pollAutomation.enabled;
      }
      
      if (tool.name === 'sendMessageToChat') {
        return this.config.rules.chatEngagement.enabled;
      }
      
      return true;
    });
  }

  /**
   * Update cooldown tracking for executed actions
   */
  private updateCooldowns(decisions: ActionDecision[]): void {
    const now = new Date();
    for (const decision of decisions) {
      this.recentActions.set(decision.action, now);
    }
  }

  /**
   * Fallback decisions if AI fails
   */
  private fallbackDecisions(analysis: ChatAnalysisResult): ActionDecision[] {
    const decisions: ActionDecision[] = [];
    const now = new Date();

    // Simple rule-based fallback
    for (const pattern of analysis.patterns) {
      if (pattern.confidence < 0.7) continue;

      if (pattern.type === 'toxicity' && pattern.severity >= 7 && this.config.rules.toxicityDetection.enabled) {
        decisions.push({
          action: this.config.rules.toxicityDetection.action === 'ban' ? 'banUser' : 'timeoutUser',
          parameters: {
            usernameOrDescriptor: pattern.users[0] || 'unknown',
            reason: 'Toxic behavior detected'
          },
          reason: `Fallback action for high toxicity (${pattern.severity}/10)`,
          confidence: 0.6,
          patterns: [pattern],
          timestamp: now
        });
      } else if (pattern.type === 'spam' && pattern.severity >= 6 && this.config.rules.spamDetection.enabled) {
        decisions.push({
          action: 'timeoutUser',
          parameters: {
            usernameOrDescriptor: pattern.users[0] || 'unknown',
            reason: 'Spam detected'
          },
          reason: `Fallback action for spam (${pattern.severity}/10)`,
          confidence: 0.6,
          patterns: [pattern],
          timestamp: now
        });
      }
    }

    return decisions;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: AutonomousConfig): void {
    this.config = newConfig;
  }

  /**
   * Get current cooldown status
   */
  getCooldownStatus(): Record<string, number> {
    const now = new Date();
    const status: Record<string, number> = {};
    
    for (const tool of AVAILABLE_MCP_TOOLS) {
      const lastUsed = this.recentActions.get(tool.name);
      if (lastUsed && tool.cooldown) {
        const cooldownMs = tool.cooldown * 60 * 1000;
        const timeSinceUsed = now.getTime() - lastUsed.getTime();
        const remainingMs = Math.max(0, cooldownMs - timeSinceUsed);
        status[tool.name] = Math.ceil(remainingMs / 1000); // seconds remaining
      } else {
        status[tool.name] = 0; // Ready to use
      }
    }
    
    return status;
  }
}
