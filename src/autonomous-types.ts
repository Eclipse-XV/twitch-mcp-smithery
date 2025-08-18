// Autonomous monitoring types and interfaces for Twitch MCP Server

// Basic chat message interface
export interface ChatMessage {
  username: string;
  content: string;
  timestamp: Date;
}

export interface AutonomousConfig {
  enabled: boolean;
  monitoringInterval: number; // milliseconds
  rules: {
    spamDetection: {
      enabled: boolean;
      threshold: number; // messages per minute from same user
      action: 'timeout' | 'ban' | 'warn';
      duration?: number; // timeout duration in seconds
    };
    toxicityDetection: {
      enabled: boolean;
      severityThreshold: number; // 1-10 scale
      action: 'timeout' | 'ban' | 'warn';
      duration?: number;
    };
    chatEngagement: {
      enabled: boolean;
      quietPeriodThreshold: number; // minutes of no chat
      responses: string[]; // pool of engagement messages
    };
    pollAutomation: {
      enabled: boolean;
      trigger: 'viewerRequest' | 'scheduled' | 'gameEvent';
      cooldown: number; // minutes between polls
    };
  };
}

export interface ChatPattern {
  type: 'spam' | 'toxicity' | 'quiet' | 'excitement' | 'question' | 'request';
  severity: number; // 1-10
  confidence: number; // 0-1
  users: string[];
  messages: string[];
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ActionDecision {
  action: string; // MCP tool name
  parameters: Record<string, any>;
  reason: string;
  confidence: number;
  patterns: ChatPattern[];
  timestamp: Date;
}

export interface FeedbackEntry {
  timestamp: Date;
  actionTaken: ActionDecision;
  userFeedback?: {
    rating: 1 | 2 | 3 | 4 | 5; // 1 = poor, 5 = excellent
    comment?: string;
    source: 'chat' | 'manual' | 'streamer';
  };
  outcome?: {
    effective: boolean;
    sideEffects?: string[];
    chatResponse?: string;
  };
}

export interface AutonomousState {
  isActive: boolean;
  lastAnalysis: Date;
  recentActions: ActionDecision[];
  learningData: {
    successfulPatterns: Map<string, number>;
    failedPatterns: Map<string, number>;
    userPreferences: Map<string, any>;
  };
  statistics: {
    actionsToday: number;
    successRate: number;
    averageConfidence: number;
    mostCommonAction: string;
  };
}

export interface ChatAnalysisResult {
  patterns: ChatPattern[];
  overallSentiment: number; // -1 to 1
  activityLevel: number; // 0-10
  needsAttention: boolean;
  recommendations: string[];
}
