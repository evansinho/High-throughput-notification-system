import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { NotificationMessage } from '../kafka/schemas/notification.schema';

/**
 * RetryService - Handles notification retry logic with exponential backoff
 *
 * Features:
 * - Exponential backoff: 1s, 2s, 4s, 8s, 16s
 * - Max retry limit: 5 attempts
 * - Circuit breaker for external services
 * - DLQ routing for failed messages
 */
@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);
  private readonly MAX_RETRIES = 5;
  private readonly BACKOFF_BASE = 1000; // 1 second
  private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  /**
   * Calculate exponential backoff delay in milliseconds
   * Formula: baseDelay * (2 ^ retryCount)
   * Results: 1s, 2s, 4s, 8s, 16s
   */
  calculateBackoffDelay(retryCount: number): number {
    return this.BACKOFF_BASE * Math.pow(2, retryCount);
  }

  /**
   * Check if message should be retried
   */
  shouldRetry(retryCount: number): boolean {
    return retryCount < this.MAX_RETRIES;
  }

  /**
   * Send message to retry queue with backoff delay
   */
  async sendToRetryQueue(
    notification: NotificationMessage,
    error: string,
  ): Promise<void> {
    const newRetryCount = (notification.retryCount || 0) + 1;
    const backoffDelay = this.calculateBackoffDelay(
      notification.retryCount || 0,
    );

    if (!this.shouldRetry(newRetryCount)) {
      // Max retries exceeded - send to DLQ
      await this.sendToDLQ(notification, error, 'max_retries_exceeded');
      return;
    }

    try {
      const retryMessage: NotificationMessage = {
        ...notification,
        retryCount: newRetryCount,
      };

      await this.kafkaProducer.sendToTopic(
        'notifications-retry',
        notification.userId,
        retryMessage,
        {
          'retry-count': newRetryCount.toString(),
          'backoff-delay': backoffDelay.toString(),
          'original-error': error,
          'retry-reason': 'processing-failure',
        },
      );

      this.logger.log(
        `Sent notification ${notification.id} to retry queue (attempt ${newRetryCount}/${this.MAX_RETRIES}, backoff: ${backoffDelay}ms)`,
      );
    } catch (retryError) {
      this.logger.error(
        `Failed to send notification ${notification.id} to retry queue:`,
        retryError,
      );
      // Send to DLQ as last resort
      await this.sendToDLQ(notification, error, 'retry_queue_failure');
    }
  }

  /**
   * Send message to Dead Letter Queue
   */
  async sendToDLQ(
    notification: NotificationMessage,
    error: string,
    reason: string,
  ): Promise<void> {
    try {
      const dlqMessage = {
        notification,
        error,
        reason,
        failedAt: Date.now(),
        retryCount: notification.retryCount || 0,
      };

      await this.kafkaProducer.sendToTopic(
        'notifications-dlq',
        notification.userId,
        dlqMessage,
        {
          'dlq-reason': reason,
          'retry-count': (notification.retryCount || 0).toString(),
          'original-error': error,
          'notification-id': notification.id,
        },
      );

      this.logger.warn(
        `Sent notification ${notification.id} to DLQ (reason: ${reason}, retries: ${notification.retryCount || 0})`,
      );
    } catch (dlqError) {
      this.logger.error(
        `CRITICAL: Failed to send notification ${notification.id} to DLQ:`,
        dlqError,
      );
    }
  }

  /**
   * Get or create circuit breaker for a service
   */
  getCircuitBreaker(serviceName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(
        serviceName,
        new CircuitBreaker(serviceName, this.logger),
      );
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    serviceName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(serviceName);
    return circuitBreaker.execute(fn);
  }
}

/**
 * Circuit Breaker implementation
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is open, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly failureThreshold = 5; // Open after 5 failures
  private readonly successThreshold = 2; // Close after 2 successes in HALF_OPEN
  private readonly timeout = 30000; // 30 seconds timeout before HALF_OPEN

  constructor(
    private readonly serviceName: string,
    private readonly logger: Logger,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition to HALF_OPEN
    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      this.state = 'HALF_OPEN';
      this.logger.log(
        `Circuit breaker for ${this.serviceName} is now HALF_OPEN (testing recovery)`,
      );
    }

    // Fail fast if circuit is OPEN
    if (this.state === 'OPEN') {
      throw new Error(`Circuit breaker OPEN for ${this.serviceName}`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
        this.logger.log(
          `Circuit breaker for ${this.serviceName} is now CLOSED (recovered)`,
        );
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.successCount = 0;
      this.logger.warn(
        `Circuit breaker for ${this.serviceName} is now OPEN (recovery failed)`,
      );
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.logger.warn(
        `Circuit breaker for ${this.serviceName} is now OPEN (${this.failureCount} failures)`,
      );
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.timeout;
  }

  getState(): string {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
