import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
