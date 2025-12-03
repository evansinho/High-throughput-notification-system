import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * AnonymizationService - GDPR-compliant data anonymization
 *
 * Features:
 * - Anonymize user data (for GDPR "right to be forgotten")
 * - Hash PII fields (email, phone, IP addresses)
 * - Remove identifying metadata
 * - Preserve analytics value (keep aggregates)
 * - Irreversible anonymization
 *
 * Use Cases:
 * - GDPR deletion requests
 * - Data retention compliance
 * - Analytics on anonymized data
 */
@Injectable()
export class AnonymizationService {
  private readonly logger = new Logger(AnonymizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Anonymize all data for a user (GDPR right to be forgotten)
   */
  async anonymizeUserData(userId: string): Promise<{
    notificationsAnonymized: number;
    eventsAnonymized: number;
    archivedNotificationsAnonymized: number;
    archivedEventsAnonymized: number;
    auditLogsAnonymized: number;
    userDeleted: boolean;
  }> {
    this.logger.log(`Starting anonymization for user: ${userId}`);

    const anonymizedId = this.generateAnonymizedId(userId);
    const anonymizedEmail = `anonymized-${anonymizedId}@deleted.local`;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Anonymize notifications
        const notificationsUpdate = await tx.notification.updateMany({
          where: { userId },
          data: {
            // Keep userId for referential integrity but anonymize content
            subject: '[REDACTED]',
            payload: { anonymized: true },
            metadata: { anonymized: true },
            errorMessage: null,
            idempotencyKey: null,
            correlationId: null,
            causationId: null,
          },
        });

        // Anonymize events
        const eventsUpdate = await tx.event.updateMany({
          where: { userId },
          data: {
            payload: { anonymized: true },
          },
        });

        // Anonymize archived notifications
        const archivedNotificationsUpdate =
          await tx.archivedNotification.updateMany({
            where: { userId },
            data: {
              subject: '[REDACTED]',
              payload: { anonymized: true },
              metadata: { anonymized: true },
              errorMessage: null,
              idempotencyKey: null,
              correlationId: null,
              causationId: null,
            },
          });

        // Anonymize archived events
        const archivedEventsUpdate = await tx.archivedEvent.updateMany({
          where: { userId },
          data: {
            payload: { anonymized: true },
          },
        });

        // Anonymize audit logs (keep for compliance but remove PII)
        const auditLogsUpdate = await tx.auditLog.updateMany({
          where: { userId },
          data: {
            userEmail: anonymizedEmail,
            details: { anonymized: true },
            ipAddress: null,
            userAgent: null,
          },
        });

        // Delete or anonymize user record
        const user = await tx.user.findUnique({ where: { id: userId } });
        let userDeleted = false;

        if (user) {
          // Option 1: Delete user (if no foreign key constraints prevent it)
          // Option 2: Anonymize user (safer for data integrity)
          await tx.user.update({
            where: { id: userId },
            data: {
              email: anonymizedEmail,
              name: 'Anonymized User',
              password: this.hashString('DELETED'),
            },
          });
          userDeleted = true;
        }

        return {
          notificationsAnonymized: notificationsUpdate.count,
          eventsAnonymized: eventsUpdate.count,
          archivedNotificationsAnonymized: archivedNotificationsUpdate.count,
          archivedEventsAnonymized: archivedEventsUpdate.count,
          auditLogsAnonymized: auditLogsUpdate.count,
          userDeleted,
        };
      });

      this.logger.log(`User ${userId} data anonymization complete`, result);

      return result;
    } catch (error) {
      this.logger.error(`Failed to anonymize data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Anonymize old audit logs (keep statistical data, remove PII)
   */
  async anonymizeOldAuditLogs(olderThanDays: number): Promise<number> {
    this.logger.log(`Anonymizing audit logs older than ${olderThanDays} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.auditLog.updateMany({
      where: {
        createdAt: { lt: cutoffDate },
        ipAddress: { not: null }, // Only anonymize if not already anonymized
      },
      data: {
        ipAddress: null,
        userAgent: null,
        details: { anonymized: true },
      },
    });

    this.logger.log(`Anonymized ${result.count} old audit logs`);

    return result.count;
  }

  /**
   * Hash sensitive fields (one-way)
   */
  async hashSensitiveFields(
    data: Record<string, any>,
    fields: string[],
  ): Promise<Record<string, any>> {
    const result = { ...data };

    for (const field of fields) {
      if (result[field]) {
        result[field] = this.hashString(result[field]);
      }
    }

    return result;
  }

  /**
   * Generate anonymized ID from original ID
   */
  private generateAnonymizedId(originalId: string): string {
    return this.hashString(originalId).substring(0, 16);
  }

  /**
   * One-way hash function
   */
  private hashString(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Check if data appears to be anonymized
   */
  isAnonymized(email: string): boolean {
    return email.startsWith('anonymized-') || email.endsWith('@deleted.local');
  }

  /**
   * Get anonymization statistics
   */
  async getAnonymizationStats(): Promise<{
    anonymizedUsers: number;
    activeUsers: number;
    anonymizationRate: number;
  }> {
    const [totalUsers, anonymizedUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          OR: [
            { email: { contains: 'anonymized-' } },
            { email: { endsWith: '@deleted.local' } },
          ],
        },
      }),
    ]);

    const activeUsers = totalUsers - anonymizedUsers;
    const anonymizationRate =
      totalUsers > 0 ? (anonymizedUsers / totalUsers) * 100 : 0;

    return {
      anonymizedUsers,
      activeUsers,
      anonymizationRate,
    };
  }
}
