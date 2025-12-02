import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationMessage } from '../kafka/schemas/notification.schema';
import { NotificationProcessorService } from './notification-processor.service';
import { RetryService } from './retry.service';
import { EachMessagePayload } from 'kafkajs';

/**
 * NotificationWorker - Consumes notification messages from Kafka and processes them
 *
 * Responsibilities:
 * - Register message handler for 'notifications' topic
 * - Parse and validate incoming messages
 * - Route to channel-specific processors
 * - Update notification status in database
 * - Handle errors with retry logic
 * - Handle errors and commit offsets
 * - Provide consumer health metrics
 */
@Injectable()
export class NotificationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationWorkerService.name);
  private isProcessing = false;
  private processedCount = 0;
  private errorCount = 0;
  private lastProcessedAt: Date | null = null;
  private totalProcessingTime = 0; // Total time spent processing messages (ms)
  private startTime: Date = new Date(); // When the worker started

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly prisma: PrismaService,
    private readonly processor: NotificationProcessorService,
    private readonly retryService: RetryService,
  ) {}

  /**
   * Initialize consumer and register message handler
   */
  async onModuleInit() {
    this.logger.log('NotificationWorker initializing...');

    // Register handler for notifications topic
    this.kafkaConsumer.registerMessageHandler(
      'notifications',
      this.handleNotification.bind(this),
    );

    this.logger.log(
      'NotificationWorker initialized and ready to consume messages',
    );
  }

  /**
   * Cleanup on module destroy - drains in-flight messages
   */
  async onModuleDestroy() {
    this.logger.log('NotificationWorker shutting down gracefully...');
    this.logger.log(
      `Current state: ${this.isProcessing ? 'processing message' : 'idle'}`,
    );

    // Wait for current message to finish processing
    if (this.isProcessing) {
      this.logger.log('Draining in-flight message...');
      const drainStartTime = Date.now();
      await this.waitForProcessing();
      const drainDuration = Date.now() - drainStartTime;

      if (this.isProcessing) {
        this.logger.error(
          `Failed to drain message within timeout (${drainDuration}ms)`,
        );
      } else {
        this.logger.log(
          `Successfully drained in-flight message (${drainDuration}ms)`,
        );
      }
    }

    // Log final metrics before shutdown
    const metrics = this.getHealthMetrics();
    this.logger.log('Final worker metrics:', JSON.stringify(metrics));
    this.logger.log('NotificationWorker shutdown complete');
  }

  /**
   * Wait for current processing to complete (with timeout)
   * Uses polling with exponential backoff to reduce CPU usage during drain
   */
  private async waitForProcessing(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    let pollInterval = 100; // Start with 100ms
    const maxPollInterval = 1000; // Max 1 second

    while (this.isProcessing && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      // Exponential backoff for polling (reduce CPU usage)
      pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
    }

    if (this.isProcessing) {
      this.logger.warn(
        `Processing timeout reached during shutdown (${timeoutMs}ms elapsed)`,
      );
    }
  }

  /**
   * Main message handler for notification messages
   */
  private async handleNotification(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Parse message value
      const value = message.value?.toString();
      if (!value) {
        this.logger.warn('Received empty message', {
          topic,
          partition,
          offset: message.offset,
        });
        return;
      }

      // Deserialize notification message
      const notification: NotificationMessage = JSON.parse(value);

      this.logger.log(
        `Processing notification: id=${notification.id}, type=${notification.type}, channel=${notification.channel}, correlationId=${notification.correlationId}`,
      );

      // Validate message structure
      if (!this.validateMessage(notification)) {
        this.logger.error('Invalid notification message structure', {
          notification,
        });
        this.errorCount++;
        return;
      }

      // Check idempotency - skip if already processed
      const existingNotification = await this.prisma.notification.findUnique({
        where: { id: notification.id },
        select: { status: true, sentAt: true },
      });

      if (
        existingNotification?.status === 'SENT' ||
        existingNotification?.sentAt
      ) {
        this.logger.log(
          `Notification ${notification.id} already processed, skipping`,
        );
        return;
      }

      // Update notification status to PROCESSING
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
      });

      // Route to channel-specific processor
      await this.processor.processNotification(notification);

      // Update notification status to SENT
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const processingTime = Date.now() - startTime;
      this.processedCount++;
      this.lastProcessedAt = new Date();
      this.totalProcessingTime += processingTime;

      this.logger.log(
        `Successfully processed notification ${notification.id} (${processingTime}ms, correlationId: ${notification.correlationId})`,
      );
    } catch (error) {
      this.errorCount++;
      const processingTime = Date.now() - startTime;

      this.logger.error(
        `Error processing notification (${processingTime}ms):`,
        error instanceof Error ? error.stack : error,
      );

      // Try to send to retry queue or DLQ
      try {
        const value = message.value?.toString();
        if (value) {
          const notification: NotificationMessage = JSON.parse(value);
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          // Send to retry queue (will route to DLQ if max retries exceeded)
          await this.retryService.sendToRetryQueue(notification, errorMessage);

          // Update notification status to FAILED
          await this.prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              errorMessage,
              retryCount: {
                increment: 1,
              },
              updatedAt: new Date(),
            },
          });
        }
      } catch (updateError) {
        this.logger.error('Failed to handle notification error:', updateError);
      }

      // Don't re-throw - we've handled the error by sending to retry/DLQ
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Validate notification message structure
   */
  private validateMessage(message: NotificationMessage): boolean {
    if (!message.id || !message.userId || !message.type || !message.channel) {
      return false;
    }

    if (!message.payload || typeof message.payload !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * Get worker health metrics with consumer lag
   */
  async getHealthMetrics() {
    // Fetch real-time consumer lag
    let lagMetrics;
    try {
      lagMetrics = await this.kafkaConsumer.getConsumerLag();
    } catch (error) {
      this.logger.warn('Failed to fetch consumer lag:', error);
      lagMetrics = { totalLag: -1, partitionLag: [] };
    }

    // Calculate throughput (messages per second)
    const uptimeSeconds = (Date.now() - this.startTime.getTime()) / 1000;
    const throughput =
      uptimeSeconds > 0
        ? (this.processedCount / uptimeSeconds).toFixed(2)
        : '0';

    // Calculate average processing time
    const avgProcessingTime =
      this.processedCount > 0
        ? Math.round(this.totalProcessingTime / this.processedCount)
        : 0;

    return {
      isProcessing: this.isProcessing,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      successRate:
        this.processedCount > 0
          ? (
              ((this.processedCount - this.errorCount) / this.processedCount) *
              100
            ).toFixed(2) + '%'
          : 'N/A',
      lastProcessedAt: this.lastProcessedAt,
      performance: {
        throughput: `${throughput} msg/s`,
        avgProcessingTime: `${avgProcessingTime}ms`,
        totalProcessingTime: `${this.totalProcessingTime}ms`,
        uptime: `${Math.round(uptimeSeconds)}s`,
      },
      consumerLag: {
        totalLag: lagMetrics.totalLag,
        partitions: lagMetrics.partitionLag,
      },
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics() {
    this.processedCount = 0;
    this.errorCount = 0;
    this.lastProcessedAt = null;
    this.totalProcessingTime = 0;
    this.startTime = new Date();
  }
}
