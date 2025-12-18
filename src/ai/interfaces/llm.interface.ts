/**
 * LLM Request/Response interfaces
 */

export interface LLMPrompt {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  finishReason: string;
  latencyMs: number;
}

export interface TokenUsage {
  inputTokens?: number; // Legacy
  outputTokens?: number; // Legacy
  promptTokens?: number; // New naming
  completionTokens?: number; // New naming
  totalTokens: number;
}

export interface LLMError {
  code: string;
  message: string;
  retryable: boolean;
  originalError?: any;
}

export interface LLMMetrics {
  requestId: string;
  model: string;
  latencyMs: number;
  tokenUsage: TokenUsage;
  cost: number;
  success: boolean;
  errorCode?: string;
  timestamp: Date;
}
