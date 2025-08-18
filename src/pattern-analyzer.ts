import { ChatPattern, ChatAnalysisResult, ChatMessage } from './autonomous-types.js';

// AI agent prompt templates for intelligent pattern detection
const ANALYSIS_PROMPTS = {
  toxicity: {
    systemPrompt: `You are a chat moderation AI. Analyze chat messages for toxic behavior including harassment, hate speech, personal attacks, threats, discrimination, or severely inappropriate language. Rate toxicity on a scale of 1-10 where:
1-3: Mildly rude or inappropriate
4-6: Moderately toxic, personal attacks  
7-8: Severely toxic, harassment
9-10: Extreme toxicity, threats, hate speech

Examples of toxic behavior:
- Personal attacks: "you're an idiot", "kill yourself"
- Harassment: Repeated negative targeting of users
- Hate speech: Discriminatory language based on identity
- Threats: Any form of threat or intimidation`,
    analysisPrompt: (messages: string[]) => `Analyze these chat messages for toxicity. For each message, provide:
1. Toxicity score (1-10)
2. Reason for the score
3. Recommended action (ignore/warn/timeout/ban)

Messages to analyze:
${messages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

Respond in JSON format: [{"messageIndex": number, "toxicityScore": number, "reason": string, "action": string, "username": string}]`
  },
  spam: {
    systemPrompt: `You are a chat spam detection AI. Identify spam patterns including:
- Promotional content (external links, channel promotion)
- Repetitive messages from same user
- Bot-like behavior
- Scam attempts
- Excessive emote spam

Rate spam severity 1-10 where:
1-3: Minor repetition or borderline promotional
4-6: Clear spam attempts
7-8: Aggressive spam or scams
9-10: Malicious spam or bot attacks`,
    analysisPrompt: (messages: string[], userCounts: Record<string, number>) => `Analyze for spam patterns. Consider message content and user frequency.

Messages:
${messages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

User message counts in last minute: ${JSON.stringify(userCounts)}

Respond in JSON: [{"messageIndex": number, "spamScore": number, "reason": string, "action": string, "username": string}]`
  },
  engagement: {
    systemPrompt: `You are a chat engagement AI. Identify opportunities for streamer engagement including:
- Direct questions to the streamer
- Requests for interaction
- Conversation starters
- Community building moments

Rate engagement opportunity 1-10 based on how much it would benefit from streamer response.`,
    analysisPrompt: (messages: string[]) => `Identify engagement opportunities in these messages:

${messages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

Respond in JSON: [{"messageIndex": number, "engagementScore": number, "reason": string, "suggestedResponse": string, "username": string}]`
  },
  sentiment: {
    systemPrompt: `You are a chat sentiment analysis AI. Analyze the overall mood and sentiment of chat messages.

Consider:
- Positive emotions: excitement, happiness, support
- Negative emotions: frustration, anger, disappointment  
- Neutral: factual statements, casual conversation

Rate overall sentiment from -1 (very negative) to +1 (very positive).`,
    analysisPrompt: (messages: string[]) => `Analyze the overall sentiment of this chat segment:

${messages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

Respond in JSON: {"overallSentiment": number, "reasoning": string, "keyIndicators": string[]}`
  },
  activity: {
    systemPrompt: `You are a chat activity analysis AI. Determine if the chat is:
- Very active (lots of messages, many users participating)
- Moderately active (steady conversation)
- Quiet (few messages, long gaps)
- Dead (no recent activity)

Consider both message frequency and user engagement quality.`,
    analysisPrompt: (messages: string[], timeSpan: string, uniqueUsers: number) => `Analyze chat activity level for the last ${timeSpan}:

Messages (${messages.length} total from ${uniqueUsers} unique users):
${messages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

Respond in JSON: {"activityLevel": number, "description": string, "recommendations": string[]}`
  }
};

export interface AIAnalysisFunction {
  (prompt: string): Promise<string>;
}

export class AIPatternAnalyzer {
  private recentPatterns: ChatPattern[] = [];
  private userMessageCounts: Map<string, { count: number, timestamps: Date[] }> = new Map();
  private aiAnalyze: AIAnalysisFunction;

  constructor(aiAnalyzeFunction: AIAnalysisFunction) {
    this.aiAnalyze = aiAnalyzeFunction;
  }

  /**
   * Analyze recent chat messages using AI agent decision making
   */
  async analyzeChat(messages: ChatMessage[]): Promise<ChatAnalysisResult> {
    if (messages.length === 0) {
      return {
        patterns: [],
        overallSentiment: 0,
        activityLevel: 0,
        needsAttention: false,
        recommendations: ['No recent chat activity']
      };
    }

    // Clean up old data
    this.cleanupOldData();
    this.updateUserTracking(messages);

    // Prepare message data for AI analysis
    const messageTexts = messages.map(m => `${m.username}: ${m.content}`);
    const userCounts = this.getUserMessageCounts();

    try {
      // Run parallel AI analyses
      const [
        toxicityResults,
        spamResults, 
        engagementResults,
        sentimentResult,
        activityResult
      ] = await Promise.all([
        this.analyzeToxicity(messageTexts),
        this.analyzeSpam(messageTexts, userCounts),
        this.analyzeEngagement(messageTexts),
        this.analyzeSentiment(messageTexts),
        this.analyzeActivity(messageTexts, '5 minutes', new Set(messages.map(m => m.username)).size)
      ]);

      // Convert AI results to ChatPatterns
      const patterns = this.convertToPatterns(
        messages,
        toxicityResults,
        spamResults,
        engagementResults
      );

      // Determine if attention is needed
      const needsAttention = this.determineAttentionNeeded(patterns);

      // Generate comprehensive recommendations
      const recommendations = this.generateAIRecommendations(
        patterns,
        sentimentResult,
        activityResult
      );

      // Store recent patterns for trend analysis
      this.recentPatterns = [...this.recentPatterns, ...patterns].slice(-50);

      return {
        patterns,
        overallSentiment: sentimentResult.overallSentiment,
        activityLevel: activityResult.activityLevel,
        needsAttention,
        recommendations
      };

    } catch (error) {
      console.error('AI analysis failed, falling back to basic analysis:', error);
      return this.fallbackAnalysis(messages);
    }
  }

  /**
   * Use AI to analyze toxicity in chat messages
   */
  private async analyzeToxicity(messages: string[]): Promise<any[]> {
    const prompt = ANALYSIS_PROMPTS.toxicity.analysisPrompt(messages);
    const systemPrompt = ANALYSIS_PROMPTS.toxicity.systemPrompt;
    
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    const response = await this.aiAnalyze(fullPrompt);
    
    try {
      return JSON.parse(response);
    } catch {
      // If parsing fails, return empty array
      return [];
    }
  }

  /**
   * Use AI to analyze spam patterns
   */
  private async analyzeSpam(messages: string[], userCounts: Record<string, number>): Promise<any[]> {
    const prompt = ANALYSIS_PROMPTS.spam.analysisPrompt(messages, userCounts);
    const systemPrompt = ANALYSIS_PROMPTS.spam.systemPrompt;
    
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    const response = await this.aiAnalyze(fullPrompt);
    
    try {
      return JSON.parse(response);
    } catch {
      return [];
    }
  }

  /**
   * Use AI to identify engagement opportunities
   */
  private async analyzeEngagement(messages: string[]): Promise<any[]> {
    const prompt = ANALYSIS_PROMPTS.engagement.analysisPrompt(messages);
    const systemPrompt = ANALYSIS_PROMPTS.engagement.systemPrompt;
    
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    const response = await this.aiAnalyze(fullPrompt);
    
    try {
      return JSON.parse(response);
    } catch {
      return [];
    }
  }

  /**
   * Use AI to analyze overall sentiment
   */
  private async analyzeSentiment(messages: string[]): Promise<any> {
    const prompt = ANALYSIS_PROMPTS.sentiment.analysisPrompt(messages);
    const systemPrompt = ANALYSIS_PROMPTS.sentiment.systemPrompt;
    
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    const response = await this.aiAnalyze(fullPrompt);
    
    try {
      return JSON.parse(response);
    } catch {
      return { overallSentiment: 0, reasoning: "Analysis failed", keyIndicators: [] };
    }
  }

  /**
   * Use AI to analyze activity level
   */
  private async analyzeActivity(messages: string[], timeSpan: string, uniqueUsers: number): Promise<any> {
    const prompt = ANALYSIS_PROMPTS.activity.analysisPrompt(messages, timeSpan, uniqueUsers);
    const systemPrompt = ANALYSIS_PROMPTS.activity.systemPrompt;
    
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    const response = await this.aiAnalyze(fullPrompt);
    
    try {
      return JSON.parse(response);
    } catch {
      return { activityLevel: 5, description: "Moderate activity", recommendations: ["Monitor chat"] };
    }
  }

  /**
   * Convert AI analysis results to ChatPattern objects
   */
  private convertToPatterns(
    messages: ChatMessage[],
    toxicityResults: any[],
    spamResults: any[],
    engagementResults: any[]
  ): ChatPattern[] {
    const patterns: ChatPattern[] = [];
    const now = new Date();

    // Process toxicity results
    for (const result of toxicityResults) {
      if (result.toxicityScore >= 4) { // Only create patterns for moderate+ toxicity
        const messageIndex = result.messageIndex - 1; // Convert to 0-based index
        if (messageIndex >= 0 && messageIndex < messages.length) {
          patterns.push({
            type: 'toxicity',
            severity: result.toxicityScore,
            confidence: 0.9, // High confidence in AI analysis
            users: [result.username || messages[messageIndex]?.username || 'unknown'],
            messages: [messages[messageIndex]?.content || ''],
            timestamp: now,
            metadata: {
              reason: result.reason,
              recommendedAction: result.action,
              aiGenerated: true
            }
          });
        }
      }
    }

    // Process spam results
    for (const result of spamResults) {
      if (result.spamScore >= 4) {
        const messageIndex = result.messageIndex - 1;
        if (messageIndex >= 0 && messageIndex < messages.length) {
          patterns.push({
            type: 'spam',
            severity: result.spamScore,
            confidence: 0.8,
            users: [result.username || messages[messageIndex]?.username || 'unknown'],
            messages: [messages[messageIndex]?.content || ''],
            timestamp: now,
            metadata: {
              reason: result.reason,
              recommendedAction: result.action,
              aiGenerated: true
            }
          });
        }
      }
    }

    // Process engagement results
    for (const result of engagementResults) {
      if (result.engagementScore >= 6) { // Only high-value engagement opportunities
        const messageIndex = result.messageIndex - 1;
        if (messageIndex >= 0 && messageIndex < messages.length) {
          patterns.push({
            type: 'question',
            severity: result.engagementScore,
            confidence: 0.7,
            users: [result.username || messages[messageIndex]?.username || 'unknown'],
            messages: [messages[messageIndex]?.content || ''],
            timestamp: now,
            metadata: {
              reason: result.reason,
              suggestedResponse: result.suggestedResponse,
              aiGenerated: true
            }
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Generate AI-powered recommendations
   */
  private generateAIRecommendations(
    patterns: ChatPattern[],
    sentimentResult: any,
    activityResult: any
  ): string[] {
    const recommendations: string[] = [];

    // Add pattern-based recommendations
    const spamPatterns = patterns.filter(p => p.type === 'spam');
    const toxicPatterns = patterns.filter(p => p.type === 'toxicity');
    const engagementPatterns = patterns.filter(p => p.type === 'question');

    if (toxicPatterns.length > 0) {
      const highestToxicity = toxicPatterns.reduce((prev, curr) => 
        prev.severity > curr.severity ? prev : curr
      );
      recommendations.push(`🚨 ${highestToxicity.metadata?.recommendedAction || 'Moderate'} ${highestToxicity.users[0]} - ${highestToxicity.metadata?.reason}`);
    }

    if (spamPatterns.length > 0) {
      const highestSpam = spamPatterns.reduce((prev, curr) => 
        prev.severity > curr.severity ? prev : curr
      );
      recommendations.push(`📵 ${highestSpam.metadata?.recommendedAction || 'Address spam from'} ${highestSpam.users[0]} - ${highestSpam.metadata?.reason}`);
    }

    if (engagementPatterns.length > 0) {
      const bestEngagement = engagementPatterns[0];
      recommendations.push(`💬 ${bestEngagement.metadata?.suggestedResponse || 'Engage with viewer questions'}`);
    }

    // Add sentiment-based recommendations
    if (sentimentResult.overallSentiment < -0.3) {
      recommendations.push(`😞 Chat sentiment is negative - consider addressing concerns or changing topic`);
    } else if (sentimentResult.overallSentiment > 0.5) {
      recommendations.push(`😊 Great positive energy in chat - good time for interaction!`);
    }

    // Add activity-based recommendations
    if (activityResult.recommendations) {
      recommendations.push(...activityResult.recommendations.map((rec: string) => `📊 ${rec}`));
    }

    return recommendations.length > 0 ? recommendations : ['✅ Chat is healthy - no immediate action needed'];
  }

  /**
   * Determine if immediate attention is needed based on AI analysis
   */
  private determineAttentionNeeded(patterns: ChatPattern[]): boolean {
    return patterns.some(p => 
      (p.type === 'spam' && p.severity >= 7) ||
      (p.type === 'toxicity' && p.severity >= 6) ||
      patterns.filter(p => p.type === 'spam').length >= 2
    );
  }

  /**
   * Fallback analysis if AI fails
   */
  private fallbackAnalysis(messages: ChatMessage[]): ChatAnalysisResult {
    return {
      patterns: [],
      overallSentiment: 0,
      activityLevel: Math.min(10, messages.length),
      needsAttention: false,
      recommendations: ['AI analysis unavailable - manual review recommended']
    };
  }

  /**
   * Get user message counts for spam detection
   */
  private getUserMessageCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    const oneMinuteAgo = new Date(Date.now() - 60000);

    for (const [username, data] of this.userMessageCounts) {
      const recentCount = data.timestamps.filter(t => t >= oneMinuteAgo).length;
      if (recentCount > 0) {
        counts[username] = recentCount;
      }
    }

    return counts;
  }

  /**
   * Update user message tracking
   */
  private updateUserTracking(messages: ChatMessage[]): void {
    for (const message of messages) {
      const userData = this.userMessageCounts.get(message.username) || {
        count: 0,
        timestamps: []
      };

      userData.count++;
      userData.timestamps.push(message.timestamp);

      this.userMessageCounts.set(message.username, userData);
    }
  }

  /**
   * Clean up old tracking data
   */
  private cleanupOldData(): void {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    for (const [username, data] of this.userMessageCounts) {
      data.timestamps = data.timestamps.filter(t => t >= tenMinutesAgo);
      if (data.timestamps.length === 0) {
        this.userMessageCounts.delete(username);
      }
    }

    this.recentPatterns = this.recentPatterns.filter(p => 
      (Date.now() - p.timestamp.getTime()) < 10 * 60 * 1000
    );
  }

  /**
   * Get pattern trends over time
   */
  getPatternTrends(): { [key: string]: number } {
    const trends: { [key: string]: number } = {};
    
    for (const pattern of this.recentPatterns) {
      trends[pattern.type] = (trends[pattern.type] || 0) + 1;
    }

    return trends;
  }
}
