import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  LLMPrompt,
  LLMError,
  TokenUsage,
} from '../interfaces/llm.interface';
import { AIObservabilityService } from './ai-observability.service';
import { ResponseCacheService } from './response-cache.service';

// New interfaces for simplified API
export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  cost: number;
  finishReason: string;
  latencyMs: number;
}

export interface StreamChunk {
  content: string;
  tokens?: number;
}

/**
 * LLM Service - Wrapper for Claude API with retries, error handling, and cost tracking
 */
@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly model: ChatAnthropic;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000; // 1 second base delay

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly observabilityService?: AIObservabilityService,
    @Optional() private readonly cacheService?: ResponseCacheService,
  ) {
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
   * Overloaded to support both LLMPrompt and string
   */
  async generateCompletion(
    prompt: LLMPrompt | string,
    options?: GenerationOptions,
  ): Promise<CompletionResponse> {
    const startTime = Date.now();
    let lastError: LLMError | null = null;

    // Convert string to LLMPrompt
    const llmPrompt: LLMPrompt =
      typeof prompt === 'string' ? { userPrompt: prompt } : prompt;

    // Check cache first (if available)
    if (this.cacheService && this.cacheService.isAvailable()) {
      const cacheKey = `${llmPrompt.systemPrompt || ''}${llmPrompt.userPrompt}`;
      const cached = await this.cacheService.get(cacheKey, {
        temperature: options?.temperature ?? llmPrompt.temperature,
        maxTokens: options?.maxTokens,
      });

      if (cached) {
        this.logger.log(
          `Cache HIT: Returning cached response (${cached.tokensUsed} tokens, $${cached.cost.toFixed(4)} saved)`,
        );

        // Return cached response (matches CompletionResponse interface)
        return {
          content: cached.response,
          model: cached.model,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: cached.tokensUsed,
          },
          cost: 0, // No cost for cached response
          finishReason: 'cached',
          latencyMs: Date.now() - startTime,
        };
      }
    }

    // Start OpenTelemetry span for tracing
    const span = this.observabilityService?.startLLMSpan('llm.generateCompletion', {
      'llm.temperature': options?.temperature ?? llmPrompt.temperature ?? 0.7,
      'llm.max_tokens': options?.maxTokens ?? 4096,
      'llm.model': this.configService.get<string>('ai.anthropic.model'),
    });

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`LLM request attempt ${attempt}/${this.maxRetries}`);

        const messages = [];

        // Add system message if provided
        if (llmPrompt.systemPrompt) {
          messages.push(new SystemMessage(llmPrompt.systemPrompt));
        }

        // Add user message
        messages.push(new HumanMessage(llmPrompt.userPrompt));

        // Create model with temperature (re-initialize if different from default)
        const temp = options?.temperature ?? llmPrompt.temperature ?? 0.7;
        const modelToUse =
          temp === this.model.temperature
            ? this.model
            : new ChatAnthropic({
                apiKey: this.configService.get<string>('ai.anthropic.apiKey'),
                model: this.configService.get<string>('ai.anthropic.model'),
                maxTokens: 4096,
                temperature: temp,
              });

        // Call Claude API
        const response = await modelToUse.invoke(messages);

        const latencyMs = Date.now() - startTime;

        // Extract usage information
        const usage: TokenUsage = {
          promptTokens: response.usage_metadata?.input_tokens ?? 0,
          completionTokens: response.usage_metadata?.output_tokens ?? 0,
          totalTokens: response.usage_metadata?.total_tokens ?? 0,
        };

        const modelName = response.response_metadata?.model ?? 'unknown';
        const cost = this.calculateCost(usage);

        const completionResponse: CompletionResponse = {
          content: response.content as string,
          model: modelName,
          usage,
          cost,
          finishReason: response.response_metadata?.stop_reason ?? 'complete',
          latencyMs,
        };

        // Record metrics
        this.observabilityService?.recordLLMRequest({
          model: modelName,
          endpoint: 'generateCompletion',
          durationSeconds: latencyMs / 1000,
          status: 'success',
          tokensInput: usage.promptTokens,
          tokensOutput: usage.completionTokens,
          tokensTotal: usage.totalTokens,
          cost,
        });

        // End span with success
        if (span) {
          this.observabilityService?.endSpanSuccess(span, {
            'llm.response.model': modelName,
            'llm.response.tokens.input': usage.promptTokens,
            'llm.response.tokens.output': usage.completionTokens,
            'llm.response.tokens.total': usage.totalTokens,
            'llm.response.cost': cost,
            'llm.response.latency_ms': latencyMs,
          });
        }

        this.logger.log(
          `LLM request successful: ${usage.totalTokens} tokens, ${latencyMs}ms, $${cost.toFixed(4)}`,
        );

        // Cache the response (if cache service is available)
        if (this.cacheService && this.cacheService.isAvailable()) {
          const cacheKey = `${llmPrompt.systemPrompt || ''}${llmPrompt.userPrompt}`;
          await this.cacheService.set(
            cacheKey,
            completionResponse.content,
            {
              tokensUsed: usage.totalTokens,
              cost,
              model: modelName,
              latencyMs,
            },
            {
              temperature: options?.temperature ?? llmPrompt.temperature,
              maxTokens: options?.maxTokens,
            },
          );
        }

        return completionResponse;
      } catch (error) {
        lastError = this.handleError(error, attempt);

        // Record error metrics
        this.observabilityService?.recordError('llm.generateCompletion', lastError.code);

        // If error is not retryable, throw immediately
        if (!lastError.retryable) {
          this.logger.error(
            `LLM request failed (non-retryable): ${lastError.message}`,
          );

          // Record failed metrics
          const latencyMs = Date.now() - startTime;
          this.observabilityService?.recordLLMRequest({
            model: this.configService.get<string>('ai.anthropic.model') || 'unknown',
            endpoint: 'generateCompletion',
            durationSeconds: latencyMs / 1000,
            status: 'error',
          });

          // End span with error
          if (span) {
            this.observabilityService?.endSpanError(span, error as Error, {
              'error.code': lastError.code,
              'error.retryable': lastError.retryable,
            });
          }

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
    const latencyMs = Date.now() - startTime;
    this.logger.error(
      `LLM request failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    );

    // Record failed metrics
    this.observabilityService?.recordLLMRequest({
      model: this.configService.get<string>('ai.anthropic.model') || 'unknown',
      endpoint: 'generateCompletion',
      durationSeconds: latencyMs / 1000,
      status: 'error',
    });

    // End span with error
    if (span && lastError) {
      this.observabilityService?.endSpanError(span, new Error(lastError.message), {
        'error.code': lastError.code,
        'error.retryable': lastError.retryable,
        'error.attempts': this.maxRetries,
      });
    }

    throw new Error(
      lastError?.message ?? 'LLM request failed after all retries',
    );
  }

  /**
   * Generate completion with streaming support
   * Returns AsyncGenerator for streaming responses
   */
  async *generateCompletionStream(
    prompt: string,
    options?: GenerationOptions,
  ): AsyncGenerator<StreamChunk> {
    try {
      this.logger.debug('Starting LLM streaming request');

      const messages = [new HumanMessage(prompt)];

      // Create model with temperature
      const temp = options?.temperature ?? 0.7;
      const modelToUse =
        temp === this.model.temperature
          ? this.model
          : new ChatAnthropic({
              apiKey: this.configService.get<string>('ai.anthropic.apiKey'),
              model: this.configService.get<string>('ai.anthropic.model'),
              maxTokens: 4096,
              temperature: temp,
            });

      // Call Claude API with streaming
      const stream = await modelToUse.stream(messages);

      let totalTokens = 0;

      for await (const chunk of stream) {
        const content = chunk.content as string;
        totalTokens += 1; // Approximate (actual token count from usage metadata at end)

        yield {
          content,
          tokens: totalTokens,
        };
      }

      this.logger.log(`LLM streaming complete: ~${totalTokens} tokens`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`LLM streaming failed: ${errorMessage}`);
      throw error;
    }
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
    const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;

    const inputCost = (inputTokens / 1_000_000) * 3.0;
    const outputCost = (outputTokens / 1_000_000) * 15.0;

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
