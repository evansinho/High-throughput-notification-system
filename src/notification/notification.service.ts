import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import {
  NotificationMessage,
  NotificationChannel as KafkaNotificationChannel,
  NotificationType as KafkaNotificationType,
  NotificationPriority as KafkaNotificationPriority,
  NotificationStatus as KafkaNotificationStatus,
} from '../kafka/schemas/notification.schema';
import {
  CreateNotificationDto,
  NotificationResponseDto,
  NotificationStatus,
  NotificationPriority,
} from './dto';
import { randomUUID } from 'crypto';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly IDEMPOTENCY_TTL = 86400; // 24 hours
  private readonly SCHEMA_VERSION = '1.0.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Generate correlation ID for request tracking
   */
  generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Check idempotency using Redis
   * Returns notification ID if request was already processed
   */
  private async checkIdempotency(
    idempotencyKey: string,
  ): Promise<string | null> {
    const cacheKey = `idempotency:${idempotencyKey}`;
    const cachedNotificationId = await this.redis.get<string>(cacheKey);

    if (cachedNotificationId) {
      this.logger.log(
        `Duplicate request detected for idempotency key: ${idempotencyKey}`,
      );
      return cachedNotificationId;
    }

    return null;
  }

  /**
   * Store idempotency key in Redis
   */
  private async storeIdempotency(
    idempotencyKey: string,
    notificationId: string,
  ): Promise<void> {
    const cacheKey = `idempotency:${idempotencyKey}`;
    await this.redis.set(cacheKey, notificationId, this.IDEMPOTENCY_TTL);
  }

  /**
   * Convert notification to Kafka message format with enrichment
   */
  private toKafkaMessage(
    notification: any,
    dto: CreateNotificationDto,
  ): NotificationMessage {
    return {
      // Metadata
      id: notification.id,
      version: this.SCHEMA_VERSION,
      timestamp: Date.now(),
      idempotencyKey: notification.idempotencyKey,

      // User information
      userId: notification.userId,
      tenantId: notification.tenantId,

      // Notification details
      type: dto.type as unknown as KafkaNotificationType,
      channel: dto.channel as unknown as KafkaNotificationChannel,
      priority: notification.priority as unknown as KafkaNotificationPriority,
      status: notification.status as unknown as KafkaNotificationStatus,

      // Scheduling
      scheduledFor: notification.scheduledFor
        ? new Date(notification.scheduledFor).getTime()
        : undefined,

      // Content
      payload: dto.payload as any, // Type will be validated by channel-specific handlers

      // Tracking
      correlationId: notification.correlationId,
      causationId: notification.causationId,

      // Retry information
      retryCount: 0,
    };
  }

  /**
   * Publish notification event to Kafka
   */
  private async publishToKafka(message: NotificationMessage): Promise<void> {
    const startTime = Date.now();

    try {
      await this.kafkaProducer.sendNotification(message);

      const latency = Date.now() - startTime;
      this.logger.log(
        `Published notification ${message.id} to Kafka (latency: ${latency}ms, correlationId: ${message.correlationId})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish notification ${message.id} to Kafka:`,
        error,
      );

      // Try to send to retry queue as fallback
      try {
        await this.kafkaProducer.sendToTopic(
          'notifications-retry',
          message.userId,
          message,
          {
            'retry-reason': 'producer-failure',
            'original-error': (error as Error).message || 'Unknown error',
            'retry-count': '0',
          },
        );

        this.logger.log(
          `Sent notification ${message.id} to retry queue after producer failure`,
        );
      } catch (retryError) {
        this.logger.error(
          `Failed to send notification ${message.id} to retry queue:`,
          retryError,
        );
        // Don't throw - notification is already saved in DB
      }
    }
  }

  /**
   * Create a new notification
   */
  async create(dto: CreateNotificationDto): Promise<NotificationResponseDto> {
    // Generate correlation ID if not provided
    const correlationId = dto.correlationId || this.generateCorrelationId();

    // Generate idempotency key if not provided (using userId + timestamp as fallback)
    const idempotencyKey =
      dto.idempotencyKey || `${dto.userId}-${Date.now()}-${randomUUID()}`;

    // Check idempotency
    const existingNotificationId = await this.checkIdempotency(idempotencyKey);
    if (existingNotificationId) {
      // Return existing notification
      const existingNotification = await this.prisma.notification.findUnique({
        where: { id: existingNotificationId },
      });

      if (!existingNotification) {
        throw new ConflictException(
          'Duplicate request detected but notification not found',
        );
      }

      return this.mapToResponseDto(existingNotification);
    }

    // Determine status based on scheduledFor
    const status = dto.scheduledFor
      ? NotificationStatus.SCHEDULED
      : NotificationStatus.PENDING;

    // Set default priority if not provided
    const priority = dto.priority || NotificationPriority.MEDIUM;

    // Create notification in database
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        tenantId: dto.tenantId,
        type: dto.type,
        channel: dto.channel,
        status,
        priority,
        payload: dto.payload as any, // Prisma stores JSON
        content: JSON.stringify(dto.payload), // deprecated field - keep for backward compatibility
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
        idempotencyKey,
        correlationId,
      },
    });

    // Store idempotency key in Redis
    await this.storeIdempotency(idempotencyKey, notification.id);

    this.logger.log(
      `Notification created: ${notification.id} (correlationId: ${correlationId})`,
    );

    // Publish to Kafka after DB persistence
    const kafkaMessage = this.toKafkaMessage(notification, dto);
    await this.publishToKafka(kafkaMessage);

    return this.mapToResponseDto(notification);
  }

  /**
   * Get notification by ID
   */
  async findOne(id: string): Promise<NotificationResponseDto | null> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return null;
    }

    return this.mapToResponseDto(notification);
  }

  /**
   * Map Prisma model to response DTO
   */
  private mapToResponseDto(notification: any): NotificationResponseDto {
    return {
      id: notification.id,
      userId: notification.userId,
      tenantId: notification.tenantId,
      channel: notification.channel,
      type: notification.type,
      priority: notification.priority,
      status: notification.status,
      scheduledFor: notification.scheduledFor,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
      correlationId: notification.correlationId,
      idempotencyKey: notification.idempotencyKey,
    };
  }
}
