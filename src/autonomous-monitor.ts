import { 
  AutonomousConfig, 
  AutonomousState, 
  ChatMessage, 
  ActionDecision,
  FeedbackEntry
} from './autonomous-types.js';
import { AIPatternAnalyzer, AIAnalysisFunction } from './pattern-analyzer.js';
import { AIDecisionEngine } from './decision-engine.js';
import { FeedbackRecorder } from './feedback-recorder.js';

interface AutonomousMonitorConfig {
  autonomous: AutonomousConfig;
  feedbackDir: string;
  maxFeedbackRetentionDays: number;
}

interface MCPToolExecutor {
  (toolName: string, parameters: Record<string, any>): Promise<{ success: boolean; result: any; error?: string }>;
}

export class AutonomousMonitor {
  private config: AutonomousMonitorConfig;
  private patternAnalyzer: AIPatternAnalyzer;
  private decisionEngine: AIDecisionEngine;
  private feedbackRecorder: FeedbackRecorder;
  private mcpExecutor: MCPToolExecutor;
  
  private state: AutonomousState;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private recentMessages: ChatMessage[] = [];
  private isRunning = false;

  constructor(
    config: AutonomousMonitorConfig,
    aiAnalyzeFunction: AIAnalysisFunction,
    mcpExecutor: MCPToolExecutor
  ) {
    this.config = config;
    this.mcpExecutor = mcpExecutor;

    // Initialize components
    this.patternAnalyzer = new AIPatternAnalyzer(aiAnalyzeFunction);
    this.decisionEngine = new AIDecisionEngine(aiAnalyzeFunction, config.autonomous);
    this.feedbackRecorder = new FeedbackRecorder({
      feedbackDir: config.feedbackDir,
      maxEntriesPerFile: 100,
      retentionDays: config.maxFeedbackRetentionDays
    });

    // Initialize state
    this.state = {
      isActive: config.autonomous.enabled,
      lastAnalysis: new Date(),
      recentActions: [],
      learningData: {
        successfulPatterns: new Map(),
        failedPatterns: new Map(),
        userPreferences: new Map()
      },
      statistics: {
        actionsToday: 0,
        successRate: 0,
        averageConfidence: 0,
        mostCommonAction: ''
      }
    };
  }

  /**
   * Start autonomous monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Autonomous monitor is already running');
      return;
    }

    if (!this.config.autonomous.enabled) {
      console.log('Autonomous monitoring is disabled in configuration');
      return;
    }

    console.log('Starting autonomous chat monitoring...');
    this.isRunning = true;
    this.state.isActive = true;

    // Start the main monitoring loop
    this.monitoringTimer = setInterval(
      () => this.monitoringLoop(),
      this.config.autonomous.monitoringInterval
    );

    // Schedule daily maintenance
    this.scheduleDailyMaintenance();

    console.log(`Autonomous monitoring started with ${this.config.autonomous.monitoringInterval}ms interval`);
  }

  /**
   * Stop autonomous monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Autonomous monitor is not running');
      return;
    }

    console.log('Stopping autonomous chat monitoring...');
    this.isRunning = false;
    this.state.isActive = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    // Generate final report for the day
    await this.generateDailyReport();

    console.log('Autonomous monitoring stopped');
  }

  /**
   * Add chat messages for analysis
   */
  addChatMessages(messages: ChatMessage[]): void {
    this.recentMessages.push(...messages);
    
    // Keep only recent messages (last 100)
    if (this.recentMessages.length > 100) {
      this.recentMessages = this.recentMessages.slice(-100);
    }
  }

  /**
   * Add user feedback for a recent action
   */
  async addUserFeedback(
    actionTimestamp: Date,
    rating: 1 | 2 | 3 | 4 | 5,
    comment?: string,
    source: 'chat' | 'manual' | 'streamer' = 'chat'
  ): Promise<boolean> {
    const success = await this.feedbackRecorder.addUserFeedback(
      actionTimestamp, 
      rating, 
      comment, 
      source
    );

    if (success) {
      // Update learning data
      await this.updateLearningFromFeedback();
    }

    return success;
  }

  /**
   * Record the outcome of a recent action
   */
  async recordActionOutcome(
    actionTimestamp: Date,
    effective: boolean,
    chatResponse?: string,
    sideEffects?: string[]
  ): Promise<boolean> {
    return await this.feedbackRecorder.recordOutcome(
      actionTimestamp,
      effective,
      chatResponse,
      sideEffects
    );
  }

  /**
   * Get current autonomous state
   */
  getState(): AutonomousState {
    return { ...this.state };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: AutonomousMonitorConfig): void {
    this.config = newConfig;
    this.decisionEngine.updateConfig(newConfig.autonomous);
    this.state.isActive = newConfig.autonomous.enabled;

    if (!newConfig.autonomous.enabled && this.isRunning) {
      this.stop();
    }
  }

  /**
   * Force an immediate analysis and action cycle
   */
  async forceAnalysis(): Promise<{ 
    patterns: any[]; 
    decisions: ActionDecision[]; 
    executed: ActionDecision[];
  }> {
    console.log('Forcing immediate chat analysis...');
    
    // Analyze current chat
    const analysis = await this.patternAnalyzer.analyzeChat(this.recentMessages);
    console.log(`Analysis complete: ${analysis.patterns.length} patterns detected, needs attention: ${analysis.needsAttention}`);

    // Make decisions
    const decisions = await this.decisionEngine.makeDecisions(analysis);
    console.log(`Decision engine produced ${decisions.length} potential actions`);

    // Execute decisions
    const executed = await this.executeDecisions(decisions);
    console.log(`Executed ${executed.length} actions`);

    return {
      patterns: analysis.patterns,
      decisions,
      executed
    };
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(): Promise<string> {
    const metrics = await this.feedbackRecorder.calculateSuccessMetrics();
    const insights = await this.feedbackRecorder.generateLearningInsights();
    
    let report = `# Autonomous Agent Performance Report\n\n`;
    report += `*Generated: ${new Date().toISOString()}*\n\n`;
    
    report += `## Current Status\n\n`;
    report += `- **Active:** ${this.state.isActive ? '✅' : '❌'}\n`;
    report += `- **Last Analysis:** ${this.state.lastAnalysis.toISOString()}\n`;
    report += `- **Recent Actions:** ${this.state.recentActions.length}\n\n`;
    
    report += `## Performance Metrics\n\n`;
    report += `- **Total Actions:** ${metrics.totalActions}\n`;
    report += `- **Success Rate:** ${(metrics.successRate * 100).toFixed(1)}%\n`;
    report += `- **Average Rating:** ${metrics.averageRating.toFixed(1)}/5\n\n`;
    
    if (metrics.mostSuccessfulActions.length > 0) {
      report += `### Most Successful Actions\n`;
      for (const action of metrics.mostSuccessfulActions) {
        report += `- ${action}\n`;
      }
      report += '\n';
    }
    
    if (metrics.leastSuccessfulActions.length > 0) {
      report += `### Least Successful Actions\n`;
      for (const action of metrics.leastSuccessfulActions) {
        report += `- ${action}\n`;
      }
      report += '\n';
    }
    
    report += `## Tool Cooldown Status\n\n`;
    const cooldowns = this.decisionEngine.getCooldownStatus();
    for (const [tool, remaining] of Object.entries(cooldowns)) {
      const status = remaining > 0 ? `${remaining}s remaining` : 'Ready';
      report += `- **${tool}:** ${status}\n`;
    }
    report += '\n';
    
    report += insights;
    
    return report;
  }

  // Private methods

  /**
   * Main monitoring loop
   */
  private async monitoringLoop(): Promise<void> {
    if (!this.state.isActive || this.recentMessages.length === 0) {
      return;
    }

    try {
      // Analyze recent chat messages
      const analysis = await this.patternAnalyzer.analyzeChat(this.recentMessages);
      this.state.lastAnalysis = new Date();

      // Only proceed if patterns need attention or there are high-confidence patterns
      const significantPatterns = analysis.patterns.filter(p => 
        p.confidence >= 0.6 && (p.severity >= 5 || analysis.needsAttention)
      );

      if (significantPatterns.length === 0) {
        return;
      }

      console.log(`Autonomous monitor detected ${significantPatterns.length} significant patterns`);

      // Make decisions based on analysis
      const decisions = await this.decisionEngine.makeDecisions({
        ...analysis,
        patterns: significantPatterns
      });

      if (decisions.length === 0) {
        return;
      }

      console.log(`Autonomous monitor planning ${decisions.length} actions`);

      // Execute the decisions
      const executed = await this.executeDecisions(decisions);
      
      if (executed.length > 0) {
        console.log(`Autonomous monitor executed ${executed.length} actions successfully`);
        
        // Update statistics
        this.updateStatistics(executed);
        
        // Store executed actions in recent actions
        this.state.recentActions.push(...executed);
        if (this.state.recentActions.length > 50) {
          this.state.recentActions = this.state.recentActions.slice(-50);
        }
      }

    } catch (error) {
      console.error('Error in autonomous monitoring loop:', error);
    }
  }

  /**
   * Execute action decisions
   */
  private async executeDecisions(decisions: ActionDecision[]): Promise<ActionDecision[]> {
    const executed: ActionDecision[] = [];

    for (const decision of decisions) {
      try {
        console.log(`Executing ${decision.action} with confidence ${decision.confidence}`);
        
        // Execute the MCP tool
        const result = await this.mcpExecutor(decision.action, decision.parameters);
        
        if (result.success) {
          executed.push(decision);
          
          // Record the action
          await this.feedbackRecorder.recordAction(decision);
          
          console.log(`Successfully executed ${decision.action}: ${decision.reason}`);
          
          // Brief pause between actions
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.error(`Failed to execute ${decision.action}:`, result.error);
        }
        
      } catch (error) {
        console.error(`Error executing ${decision.action}:`, error);
      }
    }

    return executed;
  }

  /**
   * Update statistics based on executed actions
   */
  private updateStatistics(executed: ActionDecision[]): void {
    this.state.statistics.actionsToday += executed.length;
    
    if (executed.length > 0) {
      const totalConfidence = executed.reduce((sum, action) => sum + action.confidence, 0);
      this.state.statistics.averageConfidence = totalConfidence / executed.length;
      
      // Update most common action
      const actionCounts = new Map<string, number>();
      for (const action of this.state.recentActions) {
        actionCounts.set(action.action, (actionCounts.get(action.action) || 0) + 1);
      }
      
      const mostCommon = Array.from(actionCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];
      
      if (mostCommon) {
        this.state.statistics.mostCommonAction = mostCommon[0];
      }
    }
  }

  /**
   * Update learning data from feedback
   */
  private async updateLearningFromFeedback(): Promise<void> {
    const metrics = await this.feedbackRecorder.calculateSuccessMetrics();
    this.state.statistics.successRate = metrics.successRate;
    
    // Update learning patterns based on recent feedback
    const recentFeedback = this.feedbackRecorder.getRecentFeedback(24);
    
    for (const entry of recentFeedback) {
      if (!entry.userFeedback) continue;
      
      const rating = entry.userFeedback.rating;
      const isSuccessful = rating >= 3;
      
      // Update pattern success/failure tracking
      for (const pattern of entry.actionTaken.patterns) {
        const patternKey = `${pattern.type}-${Math.floor(pattern.severity / 2)}`;
        
        if (isSuccessful) {
          const current = this.state.learningData.successfulPatterns.get(patternKey) || 0;
          this.state.learningData.successfulPatterns.set(patternKey, current + 1);
        } else {
          const current = this.state.learningData.failedPatterns.get(patternKey) || 0;
          this.state.learningData.failedPatterns.set(patternKey, current + 1);
        }
      }
    }
  }

  /**
   * Schedule daily maintenance tasks
   */
  private scheduleDailyMaintenance(): void {
    // Run daily maintenance at midnight
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.performDailyMaintenance();
      
      // Schedule subsequent daily runs
      setInterval(() => this.performDailyMaintenance(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  /**
   * Perform daily maintenance tasks
   */
  private async performDailyMaintenance(): Promise<void> {
    console.log('Performing daily autonomous monitor maintenance...');
    
    try {
      // Generate daily report
      await this.generateDailyReport();
      
      // Update learning insights
      await this.feedbackRecorder.generateLearningInsights();
      
      // Clean up old feedback files
      await this.feedbackRecorder.cleanup();
      
      // Reset daily statistics
      this.state.statistics.actionsToday = 0;
      
      console.log('Daily maintenance completed');
    } catch (error) {
      console.error('Error during daily maintenance:', error);
    }
  }

  /**
   * Generate daily report
   */
  private async generateDailyReport(): Promise<void> {
    try {
      const report = await this.feedbackRecorder.generateDailyReport();
      console.log('Generated daily autonomous agent report');
    } catch (error) {
      console.error('Error generating daily report:', error);
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    return {
      isRunning: this.isRunning,
      state: this.state,
      recentMessagesCount: this.recentMessages.length,
      config: this.config,
      cooldownStatus: this.decisionEngine.getCooldownStatus(),
      patternTrends: this.patternAnalyzer.getPatternTrends()
    };
  }
}
