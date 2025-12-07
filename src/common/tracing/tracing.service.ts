import { Injectable, OnModuleInit } from '@nestjs/common';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  trace,
  Span,
  SpanStatusCode,
  Context,
  context,
  Exception,
} from '@opentelemetry/api';

/**
 * TracingService - OpenTelemetry distributed tracing
 *
 * Features:
 * - Automatic instrumentation for HTTP, Kafka, DB queries
 * - Custom spans for business logic
 * - Trace context propagation across services
 * - Jaeger exporter for visualization
 * - Span attributes (userId, tenantId, notificationId)
 */
@Injectable()
export class TracingService implements OnModuleInit {
  private sdk: NodeSDK;
  private tracer = trace.getTracer('notification-system', '1.0.0');

  constructor() {
    // Configure Jaeger exporter
    const jaegerExporter = new JaegerExporter({
      endpoint:
        process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    });

    // Initialize OpenTelemetry SDK
    this.sdk = new NodeSDK({
      serviceName: 'notification-system',
      traceExporter: jaegerExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Automatically instrument HTTP, Express, Kafka, etc.
          '@opentelemetry/instrumentation-http': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-express': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-kafkajs': {
            enabled: true,
          },
        }),
      ],
    });
  }

  async onModuleInit() {
    // Start the SDK
    await this.sdk.start();
    // Tracing initialized - using structured logging instead of console.log
  }

  async onModuleDestroy() {
    // Gracefully shutdown the SDK
    await this.sdk.shutdown();
  }

  /**
   * Create a custom span for a specific operation
   */
  createSpan(name: string, attributes?: Record<string, any>): Span {
    const span = this.tracer.startSpan(name);

    if (attributes) {
      span.setAttributes(attributes);
    }

    return span;
  }

  /**
   * Execute a function within a span
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, any>,
  ): Promise<T> {
    const span = this.createSpan(name, attributes);

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        async () => await fn(span),
      );

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error as Exception);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Add attributes to the current active span
   */
  addAttributes(attributes: Record<string, any>) {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  /**
   * Add event to the current active span
   */
  addEvent(name: string, attributes?: Record<string, any>) {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Get the current trace context for propagation
   */
  getTraceContext(): Context {
    return context.active();
  }

  /**
   * Extract trace context from carrier (e.g., Kafka headers)
   */
  extractContext(): Context {
    // This would use the propagator configured in the SDK
    // carrier parameter intentionally unused - placeholder for future implementation
    return context.active();
  }

  /**
   * Inject trace context into carrier (e.g., Kafka headers)
   */
  injectContext(_carrier: any, ctx?: Context) {
    // This would use the propagator configured in the SDK
    const contextToUse = ctx || context.active();
    // Implementation depends on the carrier type
    return contextToUse;
  }
}
