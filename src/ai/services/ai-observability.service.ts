import { Injectable, Logger } from '@nestjs/common';
import { Counter, Histogram, Gauge, Registry } from 'prom-client';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';

/**
 * AI Observability Service
 *
 * Provides comprehensive observability for AI/LLM operations:
 * - OpenTelemetry tracing for distributed tracing
 * - Prometheus metrics for monitoring
 * - Latency tracking for performance optimization
 * - Token usage tracking for cost management
 * - Cost alerts for budget monitoring
 */
@Injectable()
export class AIObservabilityService {
  private readonly logger = new Logger(AIObservabilityService.name);
  private readonly tracer = trace.getTracer('ai-service');

  // Prometheus metrics
  private readonly llmRequestCounter: Counter;
  private readonly llmRequestDuration: Histogram;
  private readonly llmTokensUsed: Counter;
  private readonly llmCost: Counter;
  private readonly embeddingRequestCounter: Counter;
  private readonly embeddingDuration: Histogram;
  private readonly retrievalRequestCounter: Counter;
  private readonly retrievalDuration: Histogram;
  private readonly ragRequestCounter: Counter;
  private readonly ragRequestDuration: Histogram;
  private readonly dailyCostGauge: Gauge;
  private readonly errorCounter: Counter;

  constructor(private readonly registry: Registry) {
    // LLM metrics
    this.llmRequestCounter = new Counter({
      name: 'ai_llm_requests_total',
      help: 'Total number of LLM requests',
      labelNames: ['model', 'status', 'endpoint'],
      registers: [registry],
    });

    this.llmRequestDuration = new Histogram({
      name: 'ai_llm_request_duration_seconds',
      help: 'LLM request duration in seconds',
      labelNames: ['model', 'endpoint'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [registry],
    });

    this.llmTokensUsed = new Counter({
      name: 'ai_llm_tokens_total',
      help: 'Total number of tokens used',
      labelNames: ['model', 'type'], // type: input, output, total
      registers: [registry],
    });

    this.llmCost = new Counter({
      name: 'ai_llm_cost_total',
      help: 'Total cost of LLM requests in USD',
      labelNames: ['model', 'user_id', 'tenant_id'],
      registers: [registry],
    });

    // Embedding metrics
    this.embeddingRequestCounter = new Counter({
      name: 'ai_embedding_requests_total',
      help: 'Total number of embedding requests',
      labelNames: ['model', 'status'],
      registers: [registry],
    });

    this.embeddingDuration = new Histogram({
      name: 'ai_embedding_duration_seconds',
      help: 'Embedding generation duration in seconds',
      labelNames: ['model'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [registry],
    });

    // Retrieval metrics
    this.retrievalRequestCounter = new Counter({
      name: 'ai_retrieval_requests_total',
      help: 'Total number of vector retrieval requests',
      labelNames: ['status'],
      registers: [registry],
    });

    this.retrievalDuration = new Histogram({
      name: 'ai_retrieval_duration_seconds',
      help: 'Vector retrieval duration in seconds',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [registry],
    });

    // RAG metrics
    this.ragRequestCounter = new Counter({
      name: 'ai_rag_requests_total',
      help: 'Total number of RAG requests',
      labelNames: ['channel', 'category', 'status'],
      registers: [registry],
    });

    this.ragRequestDuration = new Histogram({
      name: 'ai_rag_request_duration_seconds',
      help: 'RAG request duration in seconds',
      labelNames: ['channel', 'category'],
      buckets: [0.5, 1, 2, 5, 10, 30],
      registers: [registry],
    });

    // Cost monitoring
    this.dailyCostGauge = new Gauge({
      name: 'ai_daily_cost_usd',
      help: 'Current daily AI cost in USD',
      labelNames: ['date'],
      registers: [registry],
    });

    // Error tracking
    this.errorCounter = new Counter({
      name: 'ai_errors_total',
      help: 'Total number of AI errors',
      labelNames: ['operation', 'error_type'],
      registers: [registry],
    });
  }

  /**
   * Start an OpenTelemetry span for LLM operation
   */
  startLLMSpan(operationName: string, attributes?: Record<string, any>): Span {
    return this.tracer.startSpan(operationName, {
      attributes: {
        'ai.operation': 'llm',
        ...attributes,
      },
    });
  }

  /**
   * Start an OpenTelemetry span for embedding operation
   */
  startEmbeddingSpan(operationName: string, attributes?: Record<string, any>): Span {
    return this.tracer.startSpan(operationName, {
      attributes: {
        'ai.operation': 'embedding',
        ...attributes,
      },
    });
  }

  /**
   * Start an OpenTelemetry span for retrieval operation
   */
  startRetrievalSpan(operationName: string, attributes?: Record<string, any>): Span {
    return this.tracer.startSpan(operationName, {
      attributes: {
        'ai.operation': 'retrieval',
        ...attributes,
      },
    });
  }

  /**
   * Start an OpenTelemetry span for RAG operation
   */
  startRAGSpan(operationName: string, attributes?: Record<string, any>): Span {
    return this.tracer.startSpan(operationName, {
      attributes: {
        'ai.operation': 'rag',
        ...attributes,
      },
    });
  }

  /**
   * End span with success
   */
  endSpanSuccess(span: Span, attributes?: Record<string, any>): void {
    if (attributes) {
      span.setAttributes(attributes);
    }
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  /**
   * End span with error
   */
  endSpanError(span: Span, error: Error, attributes?: Record<string, any>): void {
    if (attributes) {
      span.setAttributes(attributes);
    }
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.end();
  }

  /**
   * Record LLM request metrics
   */
  recordLLMRequest(data: {
    model: string;
    endpoint: string;
    durationSeconds: number;
    status: 'success' | 'error';
    tokensInput?: number;
    tokensOutput?: number;
    tokensTotal?: number;
    cost?: number;
    userId?: string;
    tenantId?: string;
  }): void {
    // Record request count
    this.llmRequestCounter.inc({
      model: data.model,
      status: data.status,
      endpoint: data.endpoint,
    });

    // Record duration
    this.llmRequestDuration.observe(
      {
        model: data.model,
        endpoint: data.endpoint,
      },
      data.durationSeconds,
    );

    // Record tokens
    if (data.tokensInput) {
      this.llmTokensUsed.inc(
        {
          model: data.model,
          type: 'input',
        },
        data.tokensInput,
      );
    }

    if (data.tokensOutput) {
      this.llmTokensUsed.inc(
        {
          model: data.model,
          type: 'output',
        },
        data.tokensOutput,
      );
    }

    if (data.tokensTotal) {
      this.llmTokensUsed.inc(
        {
          model: data.model,
          type: 'total',
        },
        data.tokensTotal,
      );
    }

    // Record cost
    if (data.cost) {
      this.llmCost.inc(
        {
          model: data.model,
          user_id: data.userId || 'unknown',
          tenant_id: data.tenantId || 'unknown',
        },
        data.cost,
      );
    }

    this.logger.debug(
      `LLM request recorded: ${data.model} ${data.endpoint} ${data.status} ${data.durationSeconds}s`,
    );
  }

  /**
   * Record embedding request metrics
   */
  recordEmbeddingRequest(data: {
    model: string;
    durationSeconds: number;
    status: 'success' | 'error';
    inputLength?: number;
  }): void {
    this.embeddingRequestCounter.inc({
      model: data.model,
      status: data.status,
    });

    this.embeddingDuration.observe(
      {
        model: data.model,
      },
      data.durationSeconds,
    );

    this.logger.debug(
      `Embedding request recorded: ${data.model} ${data.status} ${data.durationSeconds}s`,
    );
  }

  /**
   * Record retrieval request metrics
   */
  recordRetrievalRequest(data: {
    durationSeconds: number;
    status: 'success' | 'error';
    resultsCount?: number;
    topK?: number;
  }): void {
    this.retrievalRequestCounter.inc({
      status: data.status,
    });

    this.retrievalDuration.observe({}, data.durationSeconds);

    this.logger.debug(
      `Retrieval request recorded: ${data.status} ${data.durationSeconds}s (${data.resultsCount}/${data.topK} results)`,
    );
  }

  /**
   * Record RAG request metrics
   */
  recordRAGRequest(data: {
    channel?: string;
    category?: string;
    durationSeconds: number;
    status: 'success' | 'error';
  }): void {
    this.ragRequestCounter.inc({
      channel: data.channel || 'unknown',
      category: data.category || 'unknown',
      status: data.status,
    });

    this.ragRequestDuration.observe(
      {
        channel: data.channel || 'unknown',
        category: data.category || 'unknown',
      },
      data.durationSeconds,
    );

    this.logger.debug(
      `RAG request recorded: ${data.channel}/${data.category} ${data.status} ${data.durationSeconds}s`,
    );
  }

  /**
   * Update daily cost gauge
   */
  updateDailyCost(date: string, costUSD: number): void {
    this.dailyCostGauge.set({ date }, costUSD);
    this.logger.debug(`Daily cost updated: ${date} = $${costUSD.toFixed(4)}`);
  }

  /**
   * Record error
   */
  recordError(operation: string, errorType: string): void {
    this.errorCounter.inc({
      operation,
      error_type: errorType,
    });

    this.logger.debug(`Error recorded: ${operation} ${errorType}`);
  }

  /**
   * Check if daily cost exceeds threshold and log alert
   */
  async checkCostAlert(dailyCostUSD: number, thresholdUSD: number = 100): Promise<void> {
    if (dailyCostUSD > thresholdUSD) {
      this.logger.warn(
        `⚠️  COST ALERT: Daily AI cost ($${dailyCostUSD.toFixed(2)}) exceeds threshold ($${thresholdUSD.toFixed(2)})`,
      );

      // In production, this would trigger:
      // - PagerDuty alert
      // - Slack notification
      // - Email to admins
      // - Automatic rate limiting
    }
  }

  /**
   * Get current metrics snapshot
   */
  async getMetricsSnapshot(): Promise<{
    llmRequests: number;
    embeddingRequests: number;
    retrievalRequests: number;
    ragRequests: number;
    totalErrors: number;
  }> {
    // This is a simplified version - in production you'd query the metrics registry
    return {
      llmRequests: 0, // Would be fetched from Counter
      embeddingRequests: 0,
      retrievalRequests: 0,
      ragRequests: 0,
      totalErrors: 0,
    };
  }
}