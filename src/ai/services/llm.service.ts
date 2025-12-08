import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  LLMPrompt,
  LLMResponse,
  LLMError,
  TokenUsage,
} from '../interfaces/llm.interface';

/**
 * LLM Service - Wrapper for Claude API with retries, error handling, and cost tracking
 */
@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly model: ChatAnthropic;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000; // 1 second base delay

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ai.anthropic.apiKey');
    const modelName = this.configService.get<string>('ai.anthropic.model');

    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not configured. LLM features will not work.',
      );
    }

    this.model = new ChatAnthropic({
      apiKey: apiKey,
      model: modelName,
      maxTokens: 4096,
      temperature: 0.7,
    });

    this.logger.log(`LLM Service initialized with model: ${modelName}`);
  }

  /**
   * Generate completion with automatic retries and error handling
   */
  async generateCompletion(prompt: LLMPrompt): Promise<LLMResponse> {
    const startTime = Date.now();
    let lastError: LLMError | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`LLM request attempt ${attempt}/${this.maxRetries}`);

        const messages = [];

        // Add system message if provided
        if (prompt.systemPrompt) {
          messages.push(new SystemMessage(prompt.systemPrompt));
        }

        // Add user message
        messages.push(new HumanMessage(prompt.userPrompt));

        // Call Claude API
        const response = await this.model.invoke(messages);

        const latencyMs = Date.now() - startTime;

        // Extract usage information
        const usage: TokenUsage = {
          inputTokens: response.usage_metadata?.input_tokens ?? 0,
          outputTokens: response.usage_metadata?.output_tokens ?? 0,
          totalTokens: response.usage_metadata?.total_tokens ?? 0,
        };

        const llmResponse: LLMResponse = {
          content: response.content as string,
          model: response.response_metadata?.model ?? 'unknown',
          usage,
          finishReason: response.response_metadata?.stop_reason ?? 'complete',
          latencyMs,
        };

        this.logger.log(
          `LLM request successful: ${usage.totalTokens} tokens, ${latencyMs}ms`,
        );

        return llmResponse;
      } catch (error) {
        lastError = this.handleError(error, attempt);

        // If error is not retryable, throw immediately
        if (!lastError.retryable) {
          this.logger.error(
            `LLM request failed (non-retryable): ${lastError.message}`,
          );
          throw new Error(lastError.message);
        }

        // If this is not the last attempt, wait before retrying
        if (attempt < this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          this.logger.warn(
            `LLM request failed (attempt ${attempt}/${this.maxRetries}): ${lastError.message}. Retrying in ${delay}ms...`,
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    this.logger.error(
      `LLM request failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    );
    throw new Error(
      lastError?.message ?? 'LLM request failed after all retries',
    );
  }

  /**
   * Test connection to LLM service
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.generateCompletion({
        userPrompt: 'Say "ok" if you can hear me.',
        maxTokens: 10,
      });

      return response.content.toLowerCase().includes('ok');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`LLM connection test failed: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Calculate cost for token usage (Claude pricing)
   */
  calculateCost(usage: TokenUsage): number {
    // Claude 3.5 Sonnet pricing (as of Dec 2024)
    // Input: $3 per million tokens
    // Output: $15 per million tokens
    const inputCost = (usage.inputTokens / 1_000_000) * 3.0;
    const outputCost = (usage.outputTokens / 1_000_000) * 15.0;

    return inputCost + outputCost;
  }

  /**
   * Handle errors and determine if retryable
   */
  private handleError(error: any, attempt: number): LLMError {
    const errorMessage = error.message || 'Unknown error';

    // Rate limit errors - retryable
    if (
      errorMessage.includes('rate_limit') ||
      errorMessage.includes('429') ||
      error.status === 429
    ) {
      return {
        code: 'RATE_LIMIT_ERROR',
        message: 'Rate limit exceeded',
        retryable: true,
        originalError: error,
      };
    }

    // Server errors (5xx) - retryable
    if (
      errorMessage.includes('500') ||
      errorMessage.includes('502') ||
      errorMessage.includes('503') ||
      errorMessage.includes('504') ||
      error.status >= 500
    ) {
      return {
        code: 'SERVER_ERROR',
        message: 'Server error occurred',
        retryable: true,
        originalError: error,
      };
    }

    // Timeout errors - retryable
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      return {
        code: 'TIMEOUT_ERROR',
        message: 'Request timeout',
        retryable: true,
        originalError: error,
      };
    }

    // Network errors - retryable
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND')
    ) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network error occurred',
        retryable: true,
        originalError: error,
      };
    }

    // Invalid API key - not retryable
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('authentication') ||
      error.status === 401
    ) {
      return {
        code: 'AUTH_ERROR',
        message: 'Invalid API key',
        retryable: false,
        originalError: error,
      };
    }

    // Invalid request - not retryable
    if (errorMessage.includes('400') || error.status === 400) {
      return {
        code: 'INVALID_REQUEST',
        message: 'Invalid request parameters',
        retryable: false,
        originalError: error,
      };
    }

    // Unknown error - retryable on first attempts
    return {
      code: 'UNKNOWN_ERROR',
      message: errorMessage,
      retryable: attempt < 2, // Only retry once for unknown errors
      originalError: error,
    };
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s
    const exponentialDelay = this.retryDelay * Math.pow(2, attempt - 1);

    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5) * 2;

    return Math.floor(exponentialDelay + jitter);
  }

  /**
   * Sleep utility for retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
