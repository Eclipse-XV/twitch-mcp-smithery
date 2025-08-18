import { promises as fs } from 'fs';
import { join } from 'path';
import { 
  FeedbackEntry, 
  ActionDecision, 
  AutonomousState,
  ChatPattern 
} from './autonomous-types.js';

interface FeedbackRecorderConfig {
  feedbackDir: string;
  maxEntriesPerFile: number;
  retentionDays: number;
}

export class FeedbackRecorder {
  private config: FeedbackRecorderConfig;
  private recentFeedback: FeedbackEntry[] = [];

  constructor(config: FeedbackRecorderConfig) {
    this.config = config;
    this.ensureDirectoryExists();
  }

  /**
   * Record an action taken by the autonomous agent
   */
  async recordAction(decision: ActionDecision): Promise<void> {
    const entry: FeedbackEntry = {
      timestamp: decision.timestamp,
      actionTaken: decision,
      // userFeedback and outcome will be added later
    };

    this.recentFeedback.push(entry);
    await this.saveFeedbackEntry(entry);

    // Also log to daily action log
    await this.appendToActionLog(decision);
  }

  /**
   * Add user feedback to an existing action
   */
  async addUserFeedback(
    actionTimestamp: Date, 
    rating: 1 | 2 | 3 | 4 | 5,
    comment?: string,
    source: 'chat' | 'manual' | 'streamer' = 'chat'
  ): Promise<boolean> {
    const entry = this.recentFeedback.find(e => 
      Math.abs(e.timestamp.getTime() - actionTimestamp.getTime()) < 60000 // within 1 minute
    );

    if (entry) {
      entry.userFeedback = { rating, comment, source };
      await this.updateFeedbackEntry(entry);
      
      // Log feedback to daily feedback log
      await this.appendToFeedbackLog(entry);
      return true;
    }

    return false;
  }

  /**
   * Record the outcome of an action (effectiveness, side effects)
   */
  async recordOutcome(
    actionTimestamp: Date,
    effective: boolean,
    chatResponse?: string,
    sideEffects?: string[]
  ): Promise<boolean> {
    const entry = this.recentFeedback.find(e => 
      Math.abs(e.timestamp.getTime() - actionTimestamp.getTime()) < 60000
    );

    if (entry) {
      entry.outcome = { effective, chatResponse, sideEffects };
      await this.updateFeedbackEntry(entry);
      return true;
    }

    return false;
  }

  /**
   * Generate daily performance report
   */
  async generateDailyReport(date: Date = new Date()): Promise<string> {
    const dateStr = date.toISOString().split('T')[0];
    const entries = await this.loadFeedbackForDate(date);

    if (entries.length === 0) {
      return this.generateEmptyDayReport(dateStr);
    }

    const report = this.buildDailyReport(entries, dateStr);
    
    // Save the report
    const reportPath = join(this.config.feedbackDir, 'reports', `daily-${dateStr}.md`);
    await this.ensureDirectoryExists(join(this.config.feedbackDir, 'reports'));
    await fs.writeFile(reportPath, report, 'utf-8');
    
    return report;
  }

  /**
   * Generate learning insights from feedback data
   */
  async generateLearningInsights(): Promise<string> {
    const insights = await this.analyzeFeedbackPatterns();
    const insightsMarkdown = this.formatLearningInsights(insights);
    
    // Save insights
    const insightsPath = join(this.config.feedbackDir, 'learning-insights.md');
    await fs.writeFile(insightsPath, insightsMarkdown, 'utf-8');
    
    return insightsMarkdown;
  }

  /**
   * Get recent feedback entries for analysis
   */
  getRecentFeedback(hours: number = 24): FeedbackEntry[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.recentFeedback.filter(entry => entry.timestamp >= cutoff);
  }

  /**
   * Calculate success metrics
   */
  async calculateSuccessMetrics(): Promise<{
    totalActions: number;
    successRate: number;
    averageRating: number;
    mostSuccessfulActions: string[];
    leastSuccessfulActions: string[];
  }> {
    const recentEntries = this.getRecentFeedback(168); // Last week
    
    const actionsWithFeedback = recentEntries.filter(e => e.userFeedback);
    const totalActions = recentEntries.length;
    const successRate = actionsWithFeedback.filter(e => 
      e.userFeedback!.rating >= 3 || e.outcome?.effective
    ).length / Math.max(1, totalActions);
    
    const averageRating = actionsWithFeedback.length > 0 
      ? actionsWithFeedback.reduce((sum, e) => sum + e.userFeedback!.rating, 0) / actionsWithFeedback.length
      : 0;

    const actionPerformance = new Map<string, { total: number; success: number }>();
    
    for (const entry of actionsWithFeedback) {
      const action = entry.actionTaken.action;
      const current = actionPerformance.get(action) || { total: 0, success: 0 };
      current.total++;
      if (entry.userFeedback!.rating >= 3 || entry.outcome?.effective) {
        current.success++;
      }
      actionPerformance.set(action, current);
    }

    const sortedActions = Array.from(actionPerformance.entries())
      .map(([action, stats]) => ({ 
        action, 
        successRate: stats.success / stats.total,
        total: stats.total 
      }))
      .filter(a => a.total >= 2) // Only consider actions with at least 2 samples
      .sort((a, b) => b.successRate - a.successRate);

    return {
      totalActions,
      successRate,
      averageRating,
      mostSuccessfulActions: sortedActions.slice(0, 3).map(a => a.action),
      leastSuccessfulActions: sortedActions.slice(-3).map(a => a.action)
    };
  }

  // Private methods

  private async ensureDirectoryExists(dir?: string): Promise<void> {
    const targetDir = dir || this.config.feedbackDir;
    try {
      await fs.access(targetDir);
    } catch {
      await fs.mkdir(targetDir, { recursive: true });
    }
  }

  private async saveFeedbackEntry(entry: FeedbackEntry): Promise<void> {
    const dateStr = entry.timestamp.toISOString().split('T')[0];
    const filename = `feedback-${dateStr}.md`;
    const filepath = join(this.config.feedbackDir, filename);
    
    const entryMarkdown = this.formatFeedbackEntry(entry);
    
    try {
      await fs.appendFile(filepath, entryMarkdown + '\n\n---\n\n', 'utf-8');
    } catch (error) {
      console.error('Failed to save feedback entry:', error);
    }
  }

  private async updateFeedbackEntry(entry: FeedbackEntry): Promise<void> {
    // For simplicity, we'll append an update rather than modify in place
    await this.saveFeedbackEntry(entry);
  }

  private async appendToActionLog(decision: ActionDecision): Promise<void> {
    const dateStr = decision.timestamp.toISOString().split('T')[0];
    const filename = `actions-${dateStr}.md`;
    const filepath = join(this.config.feedbackDir, filename);
    
    const timeStr = decision.timestamp.toISOString().split('T')[1].split('.')[0];
    const logEntry = `### ${timeStr} - ${decision.action}\n\n` +
      `**Reason:** ${decision.reason}\n\n` +
      `**Confidence:** ${decision.confidence}\n\n` +
      `**Parameters:** \`${JSON.stringify(decision.parameters)}\`\n\n` +
      `**Patterns:** ${decision.patterns.map(p => `${p.type} (${p.severity}/10)`).join(', ')}\n\n`;
    
    try {
      await fs.appendFile(filepath, logEntry, 'utf-8');
    } catch (error) {
      console.error('Failed to append to action log:', error);
    }
  }

  private async appendToFeedbackLog(entry: FeedbackEntry): Promise<void> {
    const dateStr = entry.timestamp.toISOString().split('T')[0];
    const filename = `user-feedback-${dateStr}.md`;
    const filepath = join(this.config.feedbackDir, filename);
    
    const timeStr = entry.timestamp.toISOString().split('T')[1].split('.')[0];
    const feedbackEntry = `### ${timeStr} - Feedback on ${entry.actionTaken.action}\n\n` +
      `**Rating:** ${entry.userFeedback!.rating}/5 ⭐\n\n` +
      `**Source:** ${entry.userFeedback!.source}\n\n` +
      (entry.userFeedback!.comment ? `**Comment:** ${entry.userFeedback!.comment}\n\n` : '') +
      `**Original Action:** ${entry.actionTaken.reason}\n\n`;
    
    try {
      await fs.appendFile(filepath, feedbackEntry, 'utf-8');
    } catch (error) {
      console.error('Failed to append to feedback log:', error);
    }
  }

  private formatFeedbackEntry(entry: FeedbackEntry): string {
    const timeStr = entry.timestamp.toISOString().replace('T', ' ').split('.')[0];
    
    let markdown = `## Action Taken: ${entry.actionTaken.action}\n\n`;
    markdown += `**Timestamp:** ${timeStr}\n\n`;
    markdown += `**Reason:** ${entry.actionTaken.reason}\n\n`;
    markdown += `**Confidence:** ${entry.actionTaken.confidence}\n\n`;
    markdown += `**Parameters:**\n\`\`\`json\n${JSON.stringify(entry.actionTaken.parameters, null, 2)}\n\`\`\`\n\n`;
    
    if (entry.actionTaken.patterns.length > 0) {
      markdown += `**Patterns Detected:**\n`;
      for (const pattern of entry.actionTaken.patterns) {
        markdown += `- **${pattern.type}** (Severity: ${pattern.severity}/10, Confidence: ${pattern.confidence})\n`;
        markdown += `  - Users: ${pattern.users.join(', ')}\n`;
        markdown += `  - Messages: ${pattern.messages.join(' | ')}\n`;
        if (pattern.metadata?.reason) {
          markdown += `  - AI Analysis: ${pattern.metadata.reason}\n`;
        }
      }
      markdown += '\n';
    }

    if (entry.userFeedback) {
      markdown += `**User Feedback:**\n`;
      markdown += `- Rating: ${entry.userFeedback.rating}/5 ⭐\n`;
      markdown += `- Source: ${entry.userFeedback.source}\n`;
      if (entry.userFeedback.comment) {
        markdown += `- Comment: "${entry.userFeedback.comment}"\n`;
      }
      markdown += '\n';
    }

    if (entry.outcome) {
      markdown += `**Outcome:**\n`;
      markdown += `- Effective: ${entry.outcome.effective ? '✅' : '❌'}\n`;
      if (entry.outcome.chatResponse) {
        markdown += `- Chat Response: "${entry.outcome.chatResponse}"\n`;
      }
      if (entry.outcome.sideEffects && entry.outcome.sideEffects.length > 0) {
        markdown += `- Side Effects: ${entry.outcome.sideEffects.join(', ')}\n`;
      }
      markdown += '\n';
    }

    return markdown;
  }

  private async loadFeedbackForDate(date: Date): Promise<FeedbackEntry[]> {
    // For now, return recent feedback. In a full implementation,
    // we would parse the markdown files to reconstruct the entries
    const dateStr = date.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (dateStr === todayStr) {
      return this.recentFeedback;
    }
    
    // TODO: Parse markdown files to load historical feedback
    return [];
  }

  private buildDailyReport(entries: FeedbackEntry[], dateStr: string): string {
    const totalActions = entries.length;
    const entriesWithFeedback = entries.filter(e => e.userFeedback);
    const entriesWithOutcome = entries.filter(e => e.outcome);
    
    const averageRating = entriesWithFeedback.length > 0 
      ? entriesWithFeedback.reduce((sum, e) => sum + e.userFeedback!.rating, 0) / entriesWithFeedback.length
      : 0;

    const effectiveActions = entriesWithOutcome.filter(e => e.outcome!.effective).length;
    const successRate = entriesWithOutcome.length > 0 ? effectiveActions / entriesWithOutcome.length : 0;

    // Action breakdown
    const actionCounts = new Map<string, number>();
    for (const entry of entries) {
      actionCounts.set(entry.actionTaken.action, (actionCounts.get(entry.actionTaken.action) || 0) + 1);
    }

    let report = `# Daily Autonomous Agent Report - ${dateStr}\n\n`;
    
    report += `## Summary\n\n`;
    report += `- **Total Actions:** ${totalActions}\n`;
    report += `- **Actions with Feedback:** ${entriesWithFeedback.length}\n`;
    report += `- **Average Rating:** ${averageRating.toFixed(1)}/5 ⭐\n`;
    report += `- **Success Rate:** ${(successRate * 100).toFixed(1)}%\n\n`;

    report += `## Action Breakdown\n\n`;
    for (const [action, count] of Array.from(actionCounts.entries()).sort((a, b) => b[1] - a[1])) {
      report += `- **${action}:** ${count} times\n`;
    }
    report += '\n';

    if (entriesWithFeedback.length > 0) {
      report += `## Feedback Highlights\n\n`;
      const bestRated = entriesWithFeedback.reduce((best, current) => 
        current.userFeedback!.rating > best.userFeedback!.rating ? current : best
      );
      const worstRated = entriesWithFeedback.reduce((worst, current) => 
        current.userFeedback!.rating < worst.userFeedback!.rating ? current : worst
      );

      report += `### Best Rated Action (${bestRated.userFeedback!.rating}/5)\n`;
      report += `- **Action:** ${bestRated.actionTaken.action}\n`;
      report += `- **Reason:** ${bestRated.actionTaken.reason}\n`;
      if (bestRated.userFeedback!.comment) {
        report += `- **Comment:** "${bestRated.userFeedback!.comment}"\n`;
      }
      report += '\n';

      if (worstRated.userFeedback!.rating !== bestRated.userFeedback!.rating) {
        report += `### Lowest Rated Action (${worstRated.userFeedback!.rating}/5)\n`;
        report += `- **Action:** ${worstRated.actionTaken.action}\n`;
        report += `- **Reason:** ${worstRated.actionTaken.reason}\n`;
        if (worstRated.userFeedback!.comment) {
          report += `- **Comment:** "${worstRated.userFeedback!.comment}"\n`;
        }
        report += '\n';
      }
    }

    report += `## Detailed Actions\n\n`;
    for (const entry of entries.slice(0, 10)) { // Show last 10 actions
      const timeStr = entry.timestamp.toISOString().split('T')[1].split('.')[0];
      report += `### ${timeStr} - ${entry.actionTaken.action}\n`;
      report += `- **Reason:** ${entry.actionTaken.reason}\n`;
      report += `- **Confidence:** ${entry.actionTaken.confidence}\n`;
      if (entry.userFeedback) {
        report += `- **Rating:** ${entry.userFeedback.rating}/5\n`;
      }
      if (entry.outcome) {
        report += `- **Effective:** ${entry.outcome.effective ? '✅' : '❌'}\n`;
      }
      report += '\n';
    }

    return report;
  }

  private generateEmptyDayReport(dateStr: string): string {
    return `# Daily Autonomous Agent Report - ${dateStr}\n\n` +
           `## Summary\n\n` +
           `No autonomous actions were taken today.\n\n` +
           `The agent was either:\n` +
           `- Disabled\n` +
           `- No patterns detected requiring action\n` +
           `- All tools were on cooldown\n\n`;
  }

  private async analyzeFeedbackPatterns(): Promise<any> {
    const recentEntries = this.getRecentFeedback(168); // Last week
    
    // Pattern analysis
    const patternSuccessRates = new Map<string, { total: number; successful: number }>();
    const actionPerformance = new Map<string, { ratings: number[]; effectiveness: boolean[] }>();
    
    for (const entry of recentEntries) {
      // Analyze patterns
      for (const pattern of entry.actionTaken.patterns) {
        const key = `${pattern.type}-${Math.floor(pattern.severity / 2)}`;
        const current = patternSuccessRates.get(key) || { total: 0, successful: 0 };
        current.total++;
        if (entry.userFeedback?.rating >= 3 || entry.outcome?.effective) {
          current.successful++;
        }
        patternSuccessRates.set(key, current);
      }

      // Analyze action performance
      const action = entry.actionTaken.action;
      const current = actionPerformance.get(action) || { ratings: [], effectiveness: [] };
      if (entry.userFeedback) {
        current.ratings.push(entry.userFeedback.rating);
      }
      if (entry.outcome) {
        current.effectiveness.push(entry.outcome.effective);
      }
      actionPerformance.set(action, current);
    }

    return {
      patternSuccessRates: Object.fromEntries(patternSuccessRates),
      actionPerformance: Object.fromEntries(
        Array.from(actionPerformance.entries()).map(([action, data]) => [
          action,
          {
            averageRating: data.ratings.length > 0 
              ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length 
              : 0,
            effectivenessRate: data.effectiveness.length > 0 
              ? data.effectiveness.filter(e => e).length / data.effectiveness.length 
              : 0,
            sampleSize: Math.max(data.ratings.length, data.effectiveness.length)
          }
        ])
      ),
      totalSamples: recentEntries.length
    };
  }

  private formatLearningInsights(insights: any): string {
    let markdown = `# Learning Insights\n\n`;
    markdown += `*Generated: ${new Date().toISOString()}*\n\n`;
    markdown += `**Sample Size:** ${insights.totalSamples} actions\n\n`;

    markdown += `## Pattern Recognition Performance\n\n`;
    if (Object.keys(insights.patternSuccessRates).length > 0) {
      for (const [pattern, stats] of Object.entries(insights.patternSuccessRates) as any) {
        const successRate = ((stats.successful / stats.total) * 100).toFixed(1);
        markdown += `- **${pattern}:** ${successRate}% success rate (${stats.successful}/${stats.total})\n`;
      }
    } else {
      markdown += `No pattern data available yet.\n`;
    }
    markdown += '\n';

    markdown += `## Action Performance Analysis\n\n`;
    if (Object.keys(insights.actionPerformance).length > 0) {
      const sortedActions = Object.entries(insights.actionPerformance)
        .sort(([,a], [,b]) => (b as any).averageRating - (a as any).averageRating);
      
      for (const [action, data] of sortedActions as any) {
        markdown += `### ${action}\n`;
        if (data.averageRating > 0) {
          markdown += `- **Average Rating:** ${data.averageRating.toFixed(1)}/5\n`;
        }
        if (data.effectivenessRate >= 0) {
          markdown += `- **Effectiveness Rate:** ${(data.effectivenessRate * 100).toFixed(1)}%\n`;
        }
        markdown += `- **Sample Size:** ${data.sampleSize}\n\n`;
      }
    } else {
      markdown += `No action performance data available yet.\n\n`;
    }

    markdown += `## Recommendations\n\n`;
    // Add AI-generated recommendations based on the insights
    markdown += this.generateRecommendations(insights);

    return markdown;
  }

  private generateRecommendations(insights: any): string {
    const recommendations: string[] = [];

    // Analyze action performance
    for (const [action, data] of Object.entries(insights.actionPerformance) as any) {
      if (data.sampleSize < 5) continue; // Need sufficient sample size
      
      if (data.averageRating < 2.5) {
        recommendations.push(`🔸 Consider reducing frequency of **${action}** (low rating: ${data.averageRating.toFixed(1)}/5)`);
      }
      
      if (data.effectivenessRate < 0.3) {
        recommendations.push(`🔸 Review parameters for **${action}** (low effectiveness: ${(data.effectivenessRate * 100).toFixed(1)}%)`);
      }
    }

    // Analyze pattern success rates
    for (const [pattern, stats] of Object.entries(insights.patternSuccessRates) as any) {
      if (stats.total < 3) continue; // Need sufficient sample size
      
      const successRate = stats.successful / stats.total;
      if (successRate < 0.4) {
        recommendations.push(`🔸 Pattern **${pattern}** has low success rate (${(successRate * 100).toFixed(1)}%) - consider adjusting thresholds`);
      }
    }

    if (insights.totalSamples < 10) {
      recommendations.push(`🔸 Need more data for meaningful insights (current: ${insights.totalSamples} samples)`);
    }

    if (recommendations.length === 0) {
      recommendations.push(`✅ Performance looks good! Keep monitoring for continuous improvement.`);
    }

    return recommendations.join('\n') + '\n';
  }

  /**
   * Clean up old files beyond retention period
   */
  async cleanup(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    try {
      const files = await fs.readdir(this.config.feedbackDir);
      
      for (const file of files) {
        if (file.match(/^\w+-\d{4}-\d{2}-\d{2}\.md$/)) {
          const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            const fileDate = new Date(dateMatch[1]);
            if (fileDate < cutoffDate) {
              await fs.unlink(join(this.config.feedbackDir, file));
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}
