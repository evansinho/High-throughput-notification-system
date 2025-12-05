import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

/**
 * MetricsService - Prometheus metrics collection
 *
 * Implements the Four Golden Signals:
 * 1. Latency - How long does it take to serve a request
 * 2. Traffic - How much demand is placed on the system
 * 3. Errors - Rate of requests that fail
 * 4. Saturation - How "full" the service is
 *
 * Additional business metrics for notifications
 */
@Injectable()
export class MetricsService {
  // ===== FOUR GOLDEN SIGNALS =====

  // 1. LATENCY - Request duration histogram
  public readonly httpRequestDuration: Histogram;

  // 2. TRAFFIC - Request counter
  public readonly httpRequestsTotal: Counter;

  // 3. ERRORS - Error counter
  public readonly httpRequestErrors: Counter;

  // 4. SATURATION - Active connections gauge
  public readonly activeConnections: Gauge;
  public readonly queueDepth: Gauge;

  // ===== BUSINESS METRICS =====

  // Notification metrics
  public readonly notificationsTotal: Counter;
  public readonly notificationsFailed: Counter;
  public readonly notificationsByChannel: Counter;
  public readonly notificationsByPriority: Counter;
  public readonly notificationProcessingDuration: Histogram;

  // Kafka metrics
  public readonly kafkaMessagesPublished: Counter;
  public readonly kafkaMessagesConsumed: Counter;
  public readonly kafkaConsumerLag: Gauge;
  public readonly kafkaPublishErrors: Counter;

  // Database metrics
  public readonly dbQueryDuration: Histogram;
  public readonly dbConnectionsActive: Gauge;
  public readonly dbQueryErrors: Counter;

  // Cache metrics
  public readonly cacheHits: Counter;
  public readonly cacheMisses: Counter;
  public readonly cacheOperationDuration: Histogram;

  constructor() {
    // Initialize default metrics (CPU, memory, etc.)
    register.setDefaultLabels({
      app: 'notification-system',
    });

    // LATENCY
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5], // 1ms to 5s
    });

    // TRAFFIC
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    // ERRORS
    this.httpRequestErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_type'],
    });

    // SATURATION
    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active HTTP connections',
    });

    this.queueDepth = new Gauge({
      name: 'queue_depth',
      help: 'Current depth of message queue',
      labelNames: ['queue_name'],
    });

    // NOTIFICATIONS
    this.notificationsTotal = new Counter({
      name: 'notifications_total',
      help: 'Total number of notifications created',
      labelNames: ['channel', 'type', 'priority', 'status'],
    });

    this.notificationsFailed = new Counter({
      name: 'notifications_failed_total',
      help: 'Total number of failed notifications',
      labelNames: ['channel', 'type', 'error_reason'],
    });

    this.notificationsByChannel = new Counter({
      name: 'notifications_by_channel_total',
      help: 'Notifications grouped by channel',
      labelNames: ['channel'],
    });

    this.notificationsByPriority = new Counter({
      name: 'notifications_by_priority_total',
      help: 'Notifications grouped by priority',
      labelNames: ['priority'],
    });

    this.notificationProcessingDuration = new Histogram({
      name: 'notification_processing_duration_seconds',
      help: 'Time taken to process a notification',
      labelNames: ['channel', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    });

    // KAFKA
    this.kafkaMessagesPublished = new Counter({
      name: 'kafka_messages_published_total',
      help: 'Total Kafka messages published',
      labelNames: ['topic'],
    });

    this.kafkaMessagesConsumed = new Counter({
      name: 'kafka_messages_consumed_total',
      help: 'Total Kafka messages consumed',
      labelNames: ['topic', 'consumer_group'],
    });

    this.kafkaConsumerLag = new Gauge({
      name: 'kafka_consumer_lag',
      help: 'Kafka consumer lag (messages behind)',
      labelNames: ['topic', 'partition', 'consumer_group'],
    });

    this.kafkaPublishErrors = new Counter({
      name: 'kafka_publish_errors_total',
      help: 'Total Kafka publish errors',
      labelNames: ['topic', 'error_type'],
    });

    // DATABASE
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    });

    this.dbConnectionsActive = new Gauge({
      name: 'db_connections_active',
      help: 'Number of active database connections',
    });

    this.dbQueryErrors = new Counter({
      name: 'db_query_errors_total',
      help: 'Total database query errors',
      labelNames: ['operation', 'error_type'],
    });

    // CACHE
    this.cacheHits = new Counter({
      name: 'cache_hits_total',
      help: 'Total cache hits',
      labelNames: ['cache_key_pattern'],
    });

    this.cacheMisses = new Counter({
      name: 'cache_misses_total',
      help: 'Total cache misses',
      labelNames: ['cache_key_pattern'],
    });

    this.cacheOperationDuration = new Histogram({
      name: 'cache_operation_duration_seconds',
      help: 'Cache operation duration',
      labelNames: ['operation'],
      buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05],
    });
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Clear all metrics (for testing)
   */
  clearMetrics(): void {
    register.clear();
  }

  /**
   * Helper: Record HTTP request
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
  ): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration,
    );
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });

    if (statusCode >= 400) {
      this.httpRequestErrors.inc({
        method,
        route,
        error_type: statusCode >= 500 ? 'server_error' : 'client_error',
      });
    }
  }

  /**
   * Helper: Record notification creation
   */
  recordNotificationCreated(
    channel: string,
    type: string,
    priority: string,
    status: string,
  ): void {
    this.notificationsTotal.inc({ channel, type, priority, status });
    this.notificationsByChannel.inc({ channel });
    this.notificationsByPriority.inc({ priority });
  }

  /**
   * Helper: Record notification failure
   */
  recordNotificationFailed(
    channel: string,
    type: string,
    errorReason: string,
  ): void {
    this.notificationsFailed.inc({ channel, type, error_reason: errorReason });
  }

  /**
   * Helper: Record cache access
   */
  recordCacheAccess(keyPattern: string, hit: boolean, duration: number): void {
    if (hit) {
      this.cacheHits.inc({ cache_key_pattern: keyPattern });
    } else {
      this.cacheMisses.inc({ cache_key_pattern: keyPattern });
    }

    this.cacheOperationDuration.observe(
      { operation: hit ? 'get_hit' : 'get_miss' },
      duration,
    );
  }
}
