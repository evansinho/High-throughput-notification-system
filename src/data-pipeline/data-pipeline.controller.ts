import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  UseGuards,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { ArchivalService } from './archival.service';
import { AuditLogService } from './audit-log.service';
import { ExportService } from './export.service';
import { AnonymizationService } from './anonymization.service';

/**
 * DataPipelineController - Data management endpoints
 *
 * All endpoints require ADMIN role
 *
 * Features:
 * - Archival management
 * - Data export (CSV, JSON)
 * - Audit logs
 * - Data anonymization (GDPR)
 */
@Controller('data-pipeline')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DataPipelineController {
  private readonly logger = new Logger(DataPipelineController.name);

  constructor(
    private readonly archivalService: ArchivalService,
    private readonly auditLogService: AuditLogService,
    private readonly exportService: ExportService,
    private readonly anonymizationService: AnonymizationService,
  ) {}

  /**
   * POST /data-pipeline/archive - Run archival process
   */
  @Post('archive')
  async runArchival(@Req() req: any) {
    this.logger.log('Manual archival triggered');

    // Log admin action
    await this.auditLogService.logAction({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'data.archive',
      details: { manual: true },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const result = await this.archivalService.runArchival();

    return {
      success: true,
      message: 'Archival process completed',
      result,
    };
  }

  /**
   * GET /data-pipeline/archive/stats - Get archival statistics
   */
  @Get('archive/stats')
  async getArchivalStats() {
    this.logger.log('Fetching archival statistics');

    return await this.archivalService.getArchivalStats();
  }

  /**
   * GET /data-pipeline/export/notifications - Export notifications
   */
  @Get('export/notifications')
  async exportNotifications(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('format') format: string = 'json',
    @Query('userId') userId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.logger.log(
      `Exporting notifications (format: ${format}, userId: ${userId})`,
    );

    // Log admin action
    await this.auditLogService.logAction({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'data.export.notifications',
      details: { format, userId, tenantId, status, channel, from, to },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const params = {
      userId,
      tenantId,
      status,
      channel,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };

    if (format === 'csv') {
      const csv = await this.exportService.exportNotificationsToCSV(params);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=notifications-${Date.now()}.csv`,
      );
      return csv;
    } else {
      const json = await this.exportService.exportNotificationsToJSON(params);

      return json;
    }
  }

  /**
   * GET /data-pipeline/export/events - Export events
   */
  @Get('export/events')
  async exportEvents(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('format') format: string = 'json',
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.logger.log(`Exporting events (format: ${format}, userId: ${userId})`);

    // Log admin action
    await this.auditLogService.logAction({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'data.export.events',
      details: { format, userId, type, status, from, to },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const params = {
      userId,
      type,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };

    if (format === 'csv') {
      const csv = await this.exportService.exportEventsToCSV(params);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=events-${Date.now()}.csv`,
      );
      return csv;
    } else {
      const json = await this.exportService.exportEventsToJSON(params);

      return json;
    }
  }

  /**
   * GET /data-pipeline/export/audit-logs - Export audit logs
   */
  @Get('export/audit-logs')
  async exportAuditLogs(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('format') format: string = 'json',
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.logger.log(
      `Exporting audit logs (format: ${format}, userId: ${userId})`,
    );

    // Log admin action
    await this.auditLogService.logAction({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'data.export.audit_logs',
      details: { format, userId, action, from, to },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const params = {
      userId,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };

    if (format === 'csv') {
      const csv = await this.exportService.exportAuditLogsToCSV(params);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=audit-logs-${Date.now()}.csv`,
      );
      return csv;
    } else {
      const json = await this.exportService.exportAuditLogsToJSON(params);

      return json;
    }
  }

  /**
   * GET /data-pipeline/audit-logs - Get audit logs with filters
   */
  @Get('audit-logs')
  async getAuditLogs(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    this.logger.log('Fetching audit logs');

    return await this.auditLogService.getAuditLogs({
      userId,
      action,
      resourceType,
      resourceId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  /**
   * GET /data-pipeline/audit-logs/stats - Get audit log statistics
   */
  @Get('audit-logs/stats')
  async getAuditLogStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.logger.log('Fetching audit log statistics');

    return await this.auditLogService.getActionStats({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  /**
   * DELETE /data-pipeline/anonymize/:userId - Anonymize user data (GDPR)
   */
  @Delete('anonymize/:userId')
  async anonymizeUserData(@Param('userId') userId: string, @Req() req: any) {
    this.logger.log(`GDPR anonymization requested for user: ${userId}`);

    // Log admin action
    await this.auditLogService.logAction({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'data.anonymize',
      resourceType: 'user',
      resourceId: userId,
      details: { gdpr: true },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const result = await this.anonymizationService.anonymizeUserData(userId);

    return {
      success: true,
      message: 'User data anonymized successfully',
      result,
    };
  }

  /**
   * GET /data-pipeline/anonymization/stats - Get anonymization statistics
   */
  @Get('anonymization/stats')
  async getAnonymizationStats() {
    this.logger.log('Fetching anonymization statistics');

    return await this.anonymizationService.getAnonymizationStats();
  }
}
