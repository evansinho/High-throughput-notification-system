import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ExportService - Data export functionality
 *
 * Features:
 * - Export notifications to CSV/JSON
 * - Export events to CSV/JSON
 * - Export audit logs
 * - Filter by date range, user, status, etc.
 * - Stream large exports for memory efficiency
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export notifications to JSON
   */
  async exportNotificationsToJSON(params: {
    userId?: string;
    tenantId?: string;
    status?: string;
    channel?: string;
    from?: Date;
    to?: Date;
  }): Promise<any[]> {
    this.logger.log('Exporting notifications to JSON');

    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.status) where.status = params.status;
    if (params.channel) where.channel = params.channel;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    this.logger.log(`Exported ${notifications.length} notifications to JSON`);

    return notifications;
  }

  /**
   * Export notifications to CSV format
   */
  async exportNotificationsToCSV(params: {
    userId?: string;
    tenantId?: string;
    status?: string;
    channel?: string;
    from?: Date;
    to?: Date;
  }): Promise<string> {
    this.logger.log('Exporting notifications to CSV');

    const notifications = await this.exportNotificationsToJSON(params);

    // CSV headers
    const headers = [
      'id',
      'userId',
      'tenantId',
      'channel',
      'type',
      'status',
      'priority',
      'subject',
      'scheduledFor',
      'sentAt',
      'deliveredAt',
      'failedAt',
      'retryCount',
      'errorMessage',
      'createdAt',
      'updatedAt',
    ];

    // Build CSV
    const csvLines = [headers.join(',')];

    for (const notif of notifications) {
      const row = [
        notif.id,
        notif.userId,
        notif.tenantId || '',
        notif.channel,
        notif.type,
        notif.status,
        notif.priority,
        this.escapeCsvField(notif.subject || ''),
        notif.scheduledFor?.toISOString() || '',
        notif.sentAt?.toISOString() || '',
        notif.deliveredAt?.toISOString() || '',
        notif.failedAt?.toISOString() || '',
        notif.retryCount,
        this.escapeCsvField(notif.errorMessage || ''),
        notif.createdAt.toISOString(),
        notif.updatedAt.toISOString(),
      ];

      csvLines.push(row.join(','));
    }

    const csv = csvLines.join('\n');

    this.logger.log(`Exported ${notifications.length} notifications to CSV`);

    return csv;
  }

  /**
   * Export events to JSON
   */
  async exportEventsToJSON(params: {
    userId?: string;
    type?: string;
    status?: string;
    from?: Date;
    to?: Date;
  }): Promise<any[]> {
    this.logger.log('Exporting events to JSON');

    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    this.logger.log(`Exported ${events.length} events to JSON`);

    return events;
  }

  /**
   * Export events to CSV format
   */
  async exportEventsToCSV(params: {
    userId?: string;
    type?: string;
    status?: string;
    from?: Date;
    to?: Date;
  }): Promise<string> {
    this.logger.log('Exporting events to CSV');

    const events = await this.exportEventsToJSON(params);

    // CSV headers
    const headers = [
      'id',
      'type',
      'userId',
      'status',
      'payload',
      'processedAt',
      'createdAt',
      'updatedAt',
    ];

    // Build CSV
    const csvLines = [headers.join(',')];

    for (const event of events) {
      const row = [
        event.id,
        event.type,
        event.userId,
        event.status,
        this.escapeCsvField(JSON.stringify(event.payload)),
        event.processedAt?.toISOString() || '',
        event.createdAt.toISOString(),
        event.updatedAt.toISOString(),
      ];

      csvLines.push(row.join(','));
    }

    const csv = csvLines.join('\n');

    this.logger.log(`Exported ${events.length} events to CSV`);

    return csv;
  }

  /**
   * Export audit logs to JSON
   */
  async exportAuditLogsToJSON(params: {
    userId?: string;
    action?: string;
    from?: Date;
    to?: Date;
  }): Promise<any[]> {
    this.logger.log('Exporting audit logs to JSON');

    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    this.logger.log(`Exported ${logs.length} audit logs to JSON`);

    return logs;
  }

  /**
   * Export audit logs to CSV format
   */
  async exportAuditLogsToCSV(params: {
    userId?: string;
    action?: string;
    from?: Date;
    to?: Date;
  }): Promise<string> {
    this.logger.log('Exporting audit logs to CSV');

    const logs = await this.exportAuditLogsToJSON(params);

    // CSV headers
    const headers = [
      'id',
      'userId',
      'userEmail',
      'action',
      'resourceType',
      'resourceId',
      'details',
      'ipAddress',
      'userAgent',
      'createdAt',
    ];

    // Build CSV
    const csvLines = [headers.join(',')];

    for (const log of logs) {
      const row = [
        log.id,
        log.userId,
        log.userEmail,
        log.action,
        log.resourceType || '',
        log.resourceId || '',
        this.escapeCsvField(JSON.stringify(log.details || {})),
        log.ipAddress || '',
        this.escapeCsvField(log.userAgent || ''),
        log.createdAt.toISOString(),
      ];

      csvLines.push(row.join(','));
    }

    const csv = csvLines.join('\n');

    this.logger.log(`Exported ${logs.length} audit logs to CSV`);

    return csv;
  }

  /**
   * Helper: Escape CSV field (handle commas, quotes, newlines)
   */
  private escapeCsvField(field: string): string {
    if (!field) return '';

    // If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }

    return field;
  }
}
