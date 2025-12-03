import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ArchivalService - Moves old data to cold storage
 *
 * Retention Policies:
 * - Notifications: 90 days in hot storage, then archived
 * - Events: 1 year in hot storage, then archived
 * - Archived data: Kept indefinitely for compliance
 *
 * Features:
 * - Batch processing (1000 records at a time)
 * - Transaction-based archival (atomic move)
 * - Compression-ready (data stored in separate tables)
 * - Configurable retention periods
 */
@Injectable()
export class ArchivalService {
  private readonly logger = new Logger(ArchivalService.name);

  // Retention periods in days
  private readonly NOTIFICATION_RETENTION_DAYS = 90;
  private readonly EVENT_RETENTION_DAYS = 365;
  private readonly BATCH_SIZE = 1000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Archive old notifications (90+ days)
   */
  async archiveOldNotifications(): Promise<{
    archived: number;
    deleted: number;
  }> {
    this.logger.log('Starting notification archival process');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.NOTIFICATION_RETENTION_DAYS);

    let totalArchived = 0;
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        // Find old notifications to archive
        const oldNotifications = await this.prisma.notification.findMany({
          where: {
            createdAt: { lt: cutoffDate },
            // Only archive completed notifications (SENT or FAILED)
            status: { in: ['SENT', 'FAILED', 'DELIVERED'] },
          },
          take: this.BATCH_SIZE,
        });

        if (oldNotifications.length === 0) {
          hasMore = false;
          break;
        }

        // Archive in transaction
        const result = await this.prisma.$transaction(async (tx) => {
          // Create archived records
          const archivedRecords = await tx.archivedNotification.createMany({
            data: oldNotifications.map((notif) => ({
              originalId: notif.id,
              userId: notif.userId,
              tenantId: notif.tenantId,
              eventId: notif.eventId,
              channel: notif.channel,
              type: notif.type,
              subject: notif.subject,
              payload: notif.payload as any,
              status: notif.status,
              priority: notif.priority,
              scheduledFor: notif.scheduledFor,
              sentAt: notif.sentAt,
              deliveredAt: notif.deliveredAt,
              failedAt: notif.failedAt,
              retryCount: notif.retryCount,
              maxRetries: notif.maxRetries,
              errorMessage: notif.errorMessage,
              metadata: notif.metadata as any,
              idempotencyKey: notif.idempotencyKey,
              correlationId: notif.correlationId,
              causationId: notif.causationId,
              createdAt: notif.createdAt,
              updatedAt: notif.updatedAt,
            })),
            skipDuplicates: true, // Skip if already archived
          });

          // Delete original records
          const deletedRecords = await tx.notification.deleteMany({
            where: {
              id: { in: oldNotifications.map((n) => n.id) },
            },
          });

          return {
            archived: archivedRecords.count,
            deleted: deletedRecords.count,
          };
        });

        totalArchived += result.archived;
        totalDeleted += result.deleted;

        this.logger.log(
          `Archived ${result.archived} notifications, deleted ${result.deleted} originals`,
        );
      } catch (error) {
        this.logger.error('Failed to archive notifications batch:', error);
        // Continue with next batch
      }
    }

    this.logger.log(
      `Notification archival complete: ${totalArchived} archived, ${totalDeleted} deleted`,
    );

    return { archived: totalArchived, deleted: totalDeleted };
  }

  /**
   * Archive old events (1+ year)
   */
  async archiveOldEvents(): Promise<{
    archived: number;
    deleted: number;
  }> {
    this.logger.log('Starting event archival process');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.EVENT_RETENTION_DAYS);

    let totalArchived = 0;
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        // Find old events to archive
        const oldEvents = await this.prisma.event.findMany({
          where: {
            createdAt: { lt: cutoffDate },
            // Only archive completed or failed events
            status: { in: ['completed', 'failed'] },
          },
          take: this.BATCH_SIZE,
        });

        if (oldEvents.length === 0) {
          hasMore = false;
          break;
        }

        // Archive in transaction
        const result = await this.prisma.$transaction(async (tx) => {
          // Create archived records
          const archivedRecords = await tx.archivedEvent.createMany({
            data: oldEvents.map((event) => ({
              originalId: event.id,
              type: event.type,
              userId: event.userId,
              payload: event.payload as any,
              status: event.status,
              processedAt: event.processedAt,
              createdAt: event.createdAt,
              updatedAt: event.updatedAt,
            })),
            skipDuplicates: true,
          });

          // Delete original records
          const deletedRecords = await tx.event.deleteMany({
            where: {
              id: { in: oldEvents.map((e) => e.id) },
            },
          });

          return {
            archived: archivedRecords.count,
            deleted: deletedRecords.count,
          };
        });

        totalArchived += result.archived;
        totalDeleted += result.deleted;

        this.logger.log(
          `Archived ${result.archived} events, deleted ${result.deleted} originals`,
        );
      } catch (error) {
        this.logger.error('Failed to archive events batch:', error);
        // Continue with next batch
      }
    }

    this.logger.log(
      `Event archival complete: ${totalArchived} archived, ${totalDeleted} deleted`,
    );

    return { archived: totalArchived, deleted: totalDeleted };
  }

  /**
   * Run full archival process (notifications + events)
   */
  async runArchival(): Promise<{
    notifications: { archived: number; deleted: number };
    events: { archived: number; deleted: number };
  }> {
    this.logger.log('Starting full archival process');

    const [notifications, events] = await Promise.all([
      this.archiveOldNotifications(),
      this.archiveOldEvents(),
    ]);

    this.logger.log('Full archival process complete');

    return { notifications, events };
  }

  /**
   * Get archival statistics
   */
  async getArchivalStats(): Promise<{
    activeNotifications: number;
    archivedNotifications: number;
    activeEvents: number;
    archivedEvents: number;
    oldestActive: {
      notification: Date | null;
      event: Date | null;
    };
  }> {
    const [
      activeNotifications,
      archivedNotifications,
      activeEvents,
      archivedEvents,
      oldestNotification,
      oldestEvent,
    ] = await Promise.all([
      this.prisma.notification.count(),
      this.prisma.archivedNotification.count(),
      this.prisma.event.count(),
      this.prisma.archivedEvent.count(),
      this.prisma.notification.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.event.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      activeNotifications,
      archivedNotifications,
      activeEvents,
      archivedEvents,
      oldestActive: {
        notification: oldestNotification?.createdAt || null,
        event: oldestEvent?.createdAt || null,
      },
    };
  }
}
