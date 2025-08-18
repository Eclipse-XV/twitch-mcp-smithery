# Autonomous Chat Monitoring

This document describes the autonomous chat monitoring features added to the Twitch MCP Server. These features allow AI clients to automatically monitor Twitch chat and take intelligent actions based on patterns and user feedback.

## Overview

The autonomous monitoring system consists of several interconnected components:

1. **AI-Powered Pattern Analyzer** - Uses AI models to detect toxicity, spam, engagement opportunities, and other chat patterns
2. **Decision Engine** - Makes intelligent decisions about which MCP tools to call based on detected patterns and configuration rules
3. **Feedback Recording System** - Logs all actions and user feedback to markdown files for continuous learning
4. **Learning System** - Adjusts behavior based on historical performance and user feedback
5. **Manual Override Controls** - Tools to start/stop autonomous mode and provide feedback

## Key Features

### 🤖 AI-Driven Analysis
- Uses AI models instead of hardcoded keywords for pattern detection
- Analyzes toxicity, spam, engagement opportunities, sentiment, and activity levels
- Provides confidence scores and detailed reasoning for all decisions

### 📊 Comprehensive Logging
- Daily action logs in markdown format
- User feedback tracking with ratings and comments  
- Performance metrics and learning insights
- Automatic report generation

### 🎯 Intelligent Decision Making
- Context-aware parameter generation for MCP tools
- Cooldown periods to prevent action spam
- Configurable severity thresholds and action types
- Fallback logic when AI analysis fails

### 📈 Continuous Learning
- Tracks success/failure patterns over time
- Adjusts behavior based on user feedback ratings
- Generates recommendations for improving performance
- Maintains learning insights in markdown files

## Configuration

Add the following to your server configuration to enable autonomous monitoring:

```javascript
{
  // ... existing config
  autonomous: {
    enabled: true,                    // Enable autonomous monitoring
    monitoringInterval: 30000,        // Analysis interval in milliseconds
    feedbackDir: "./autonomous-feedback", // Directory for logs
    maxFeedbackRetentionDays: 30,     // Days to keep feedback files
    
    rules: {
      spamDetection: {
        enabled: true,
        threshold: 5,                 // Messages per minute threshold
        action: "timeout",            // timeout | ban | warn
        duration: 300                 // Timeout duration in seconds
      },
      
      toxicityDetection: {
        enabled: true,
        severityThreshold: 6,         // Minimum severity (1-10) to act
        action: "timeout",
        duration: 1800
      },
      
      chatEngagement: {
        enabled: true,
        quietPeriodThreshold: 10,     // Minutes of quiet before engagement
        responses: [
          "How's everyone doing today?",
          "What would you like to see next?",
          // ... more engagement messages
        ]
      },
      
      pollAutomation: {
        enabled: false,               // Auto-create polls
        trigger: "viewerRequest",     // viewerRequest | scheduled | gameEvent  
        cooldown: 30                  // Minutes between polls
      }
    }
  }
}
```

## Available MCP Tools

### Control Tools

#### `startAutonomousMonitoring`
Starts the autonomous monitoring system.

#### `stopAutonomousMonitoring`
Stops the autonomous monitoring system and generates a final daily report.

#### `getAutonomousStatus`
Returns detailed status information including:
- Current active state
- Today's statistics (actions taken, success rate, etc.)
- Recent actions taken
- System health information

#### `forceAutonomousAnalysis`
Forces an immediate analysis of current chat and executes any recommended actions. Useful for testing or manual intervention.

### Feedback Tools

#### `addUserFeedbackToAutonomous`
Allows providing feedback on recent autonomous actions:
- **rating**: 1-5 star rating (1 = poor, 5 = excellent)  
- **comment**: Optional text feedback

This feedback is used to improve future decision making.

#### `generateAutonomousReport`
Generates a comprehensive performance report including:
- Current system status
- Performance metrics and success rates
- Most/least successful actions
- Tool cooldown status
- Learning insights and recommendations

## File Structure

When autonomous monitoring is enabled, the following files are created in the configured directory:

```
autonomous-feedback/
├── actions-YYYY-MM-DD.md          # Daily action logs
├── feedback-YYYY-MM-DD.md         # Detailed feedback entries  
├── user-feedback-YYYY-MM-DD.md    # User feedback logs
├── learning-insights.md           # Current learning insights
└── reports/
    └── daily-YYYY-MM-DD.md        # Daily performance reports
```

## AI Integration

The system is designed to work with any AI model through the `AIAnalysisFunction` interface. Currently includes placeholder implementations, but can be easily connected to:

- OpenAI GPT models
- Anthropic Claude
- Local LLMs via Ollama
- Any other AI service with text completion

### Sample AI Prompts

The system uses carefully crafted prompts for different analysis types:

**Toxicity Analysis:**
```
You are a chat moderation AI. Analyze chat messages for toxic behavior including harassment, hate speech, personal attacks, threats, discrimination...

Rate toxicity on a scale of 1-10 where:
1-3: Mildly rude or inappropriate
4-6: Moderately toxic, personal attacks  
7-8: Severely toxic, harassment
9-10: Extreme toxicity, threats, hate speech
```

**Decision Making:**
```
You are an autonomous Twitch chat management AI. Based on the chat analysis, decide what actions to take using available MCP tools.

DECISION CRITERIA:
- Only take action if patterns have high confidence (>0.6) and appropriate severity
- Prioritize moderation for toxicity/spam patterns
- Be conservative with high-risk actions (timeouts/bans)
- Match actions to pattern severity and configuration settings
```

## Learning and Adaptation

The autonomous system learns from user feedback and adjusts its behavior over time:

### Success Tracking
- Tracks success rates for different action types
- Monitors pattern recognition accuracy
- Records which actions receive positive/negative feedback

### Performance Metrics
- Daily action counts and success rates
- Average confidence scores for decisions
- Most effective vs least effective actions
- Pattern detection accuracy over time

### Adaptive Behavior
- Adjusts severity thresholds based on feedback
- Learns user preferences for different situations
- Improves parameter generation for different contexts
- Identifies and reduces false positive patterns

## Example Workflow

1. **Chat Monitoring**: System continuously monitors incoming chat messages
2. **Pattern Detection**: AI analyzes messages for toxicity, spam, engagement opportunities
3. **Decision Making**: AI decides which actions to take based on patterns and rules
4. **Action Execution**: System executes approved actions (timeouts, polls, engagement messages)
5. **Feedback Collection**: Users can rate actions and provide comments
6. **Learning**: System analyzes feedback and adjusts future behavior
7. **Reporting**: Daily reports track performance and generate insights

## Best Practices

### Initial Setup
1. Start with conservative settings (higher thresholds)
2. Enable logging and monitor initial behavior
3. Provide frequent feedback on actions taken
4. Gradually tune settings based on performance

### Ongoing Management  
1. Review daily reports regularly
2. Provide feedback on both good and bad actions
3. Adjust rules based on learning insights
4. Monitor false positive/negative rates

### AI Model Selection
1. Choose models with strong content moderation capabilities
2. Consider response time vs accuracy tradeoffs
3. Test thoroughly with your specific chat patterns
4. Implement fallback logic for API failures

## Troubleshooting

### Common Issues

**Autonomous system not starting:**
- Check that `autonomous.enabled` is `true` in config
- Verify AI analysis function is properly configured
- Check for any initialization errors in logs

**Too many/few actions being taken:**
- Adjust severity thresholds in configuration
- Review pattern detection confidence scores
- Modify cooldown periods for action types

**Poor decision quality:**
- Provide more feedback on autonomous actions
- Review and improve AI prompts for your use case
- Check if AI model is appropriate for content moderation

### Debug Information

Use `getAutonomousStatus` to get detailed debug information including:
- Current configuration settings
- Recent chat message count
- Pattern detection trends
- Tool cooldown status
- Recent action history

## Security Considerations

- The system can take moderation actions automatically
- Always test thoroughly before enabling in production
- Set appropriate severity thresholds to prevent false positives
- Monitor logs regularly for unexpected behavior
- Have manual override capabilities readily available
- Consider implementing approval workflows for high-impact actions

## Contributing

When extending the autonomous system:

1. **New Patterns**: Add pattern types to `autonomous-types.ts`
2. **New Actions**: Update the decision engine with new MCP tool mappings
3. **AI Prompts**: Test prompt changes thoroughly with diverse chat data
4. **Feedback Types**: Extend feedback recording for new metrics
5. **Learning**: Add new learning algorithms to improve adaptation

## Performance

The autonomous system is designed to be efficient:

- **Memory**: Maintains sliding windows of recent data
- **CPU**: Configurable analysis intervals to balance responsiveness vs resources  
- **Storage**: Automatic cleanup of old feedback files
- **Network**: Batches API calls and respects rate limits
- **Scalability**: Stateless design allows horizontal scaling

## Conclusion

The autonomous monitoring system transforms the Twitch MCP server from a reactive tool into a proactive AI agent capable of intelligent chat management. By combining AI-powered analysis, intelligent decision making, comprehensive logging, and continuous learning, it provides a sophisticated solution for automated stream management while maintaining transparency and user control.
