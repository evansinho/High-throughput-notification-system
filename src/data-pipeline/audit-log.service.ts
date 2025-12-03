import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AuditLogService - Tracks all admin and sensitive actions
 *
 * Features:
 * - Log admin actions (retry, role changes, exports, etc.)
 * - Track IP address and user agent
 * - Store detailed action metadata
 * - Query audit logs by user, action, resource, or date
 * - GDPR-compliant audit trail
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an admin action
   */
  async logAction(params: {
    userId: string;
    userEmail: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId,
          userEmail: params.userEmail,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          details: params.details,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });

      this.logger.log(
        `Audit log created: ${params.action} by ${params.userEmail}`,
      );
    } catch (error) {
      this.logger.error('Failed to create audit log:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(params: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }): Promise<{
    data: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.resourceType) where.resourceType = params.resourceType;
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get recent actions by a user
   */
  async getUserActions(
    userId: string,
    limit = 50,
  ): Promise<{
    userId: string;
    actions: any[];
  }> {
    const actions = await this.prisma.auditLog.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      userId,
      actions,
    };
  }

  /**
   * Get all actions on a specific resource
   */
  async getResourceActions(
    resourceType: string,
    resourceId: string,
  ): Promise<any[]> {
    return await this.prisma.auditLog.findMany({
      where: {
        resourceType,
        resourceId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get action statistics
   */
  async getActionStats(params?: { from?: Date; to?: Date }): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    topUsers: Array<{ userId: string; userEmail: string; count: number }>;
  }> {
    const where: any = {};
    if (params?.from || params?.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const [totalActions, actionGroups, userGroups] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { id: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['userId', 'userEmail'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    const actionsByType = actionGroups.reduce(
      (acc, group) => {
        acc[group.action] = group._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topUsers = userGroups.map((group) => ({
      userId: group.userId,
      userEmail: group.userEmail,
      count: group._count.id,
    }));

    return {
      totalActions,
      actionsByType,
      topUsers,
    };
  }
}
