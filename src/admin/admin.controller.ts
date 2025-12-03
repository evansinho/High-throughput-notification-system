import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KafkaAdminService } from '../kafka/kafka-admin.service';

/**
 * AdminController - Admin endpoints for system management
 *
 * All endpoints require JWT authentication + ADMIN role
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafkaAdmin: KafkaAdminService,
  ) {}

  /**
   * GET /admin/metrics - System health metrics
   */
  @Get('metrics')
  async getSystemMetrics() {
    this.logger.log('Fetching system metrics');

    try {
      // Database metrics
      const dbHealth = await this.prisma.healthCheck();
      const dbPoolMetrics = await this.prisma.getPoolMetrics();

      // Notification counts by status
      const notificationStats = await this.prisma.notification.groupBy({
        by: ['status'],
        _count: { id: true },
      });

      // Event counts by status
      const eventStats = await this.prisma.event.groupBy({
        by: ['status'],
        _count: { id: true },
      });

      // Recent activity (last 24 hours)
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentNotifications = await this.prisma.notification.count({
        where: { createdAt: { gte: dayAgo } },
      });
      const recentEvents = await this.prisma.event.count({
        where: { createdAt: { gte: dayAgo } },
      });

      // Job metrics from Redis
      const jobMetrics = await Promise.all([
        this.redis.get<any>('metrics:cleanup:last_run'),
        this.redis.get<any>('metrics:cache_warming:last_run'),
        this.redis.get<any>('monitoring:performance:latest'),
      ]);

      return {
        timestamp: new Date().toISOString(),
        database: {
          healthy: dbHealth,
          pool: dbPoolMetrics,
        },
        notifications: {
          byStatus: notificationStats,
          last24Hours: recentNotifications,
        },
        events: {
          byStatus: eventStats,
          last24Hours: recentEvents,
        },
        jobs: {
          lastCleanup: jobMetrics[0],
          lastCacheWarming: jobMetrics[1],
          performance: jobMetrics[2],
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch system metrics:', error);
      throw error;
    }
  }

  /**
   * GET /admin/queue/stats - Kafka queue statistics
   */
  @Get('queue/stats')
  async getQueueStats() {
    this.logger.log('Fetching Kafka queue statistics');

    try {
      const topics = await this.kafkaAdmin.listTopics();
      const topicStats = await Promise.all(
        topics.map(async (topic: string) => {
          const offsets = await this.kafkaAdmin.fetchTopicOffsets(topic);
          return {
            topic,
            partitions: offsets,
            totalMessages: offsets
              .reduce(
                (sum: bigint, partition: any) => sum + BigInt(partition.high),
                BigInt(0),
              )
              .toString(),
          };
        }),
      );

      // Consumer group lag
      const consumerGroups = await this.kafkaAdmin.listGroups();

      return {
        timestamp: new Date().toISOString(),
        topics: topicStats,
        consumerGroups: consumerGroups.groups.map((g: any) => ({
          groupId: g.groupId,
          protocol: g.protocolType,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to fetch queue stats:', error);
      throw error;
    }
  }

  /**
   * GET /admin/notifications - Search and filter notifications
   */
  @Get('notifications')
  async searchNotifications(
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('userId') userId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    this.logger.log('Searching notifications with filters');

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) where.status = status;
    if (channel) where.channel = channel;
    if (userId) where.userId = userId;
    if (tenantId) where.tenantId = tenantId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    try {
      const [notifications, total] = await Promise.all([
        this.prisma.notification.findMany({
          where,
          take: limitNum,
          skip,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            userId: true,
            tenantId: true,
            channel: true,
            type: true,
            status: true,
            priority: true,
            subject: true,
            scheduledFor: true,
            sentAt: true,
            deliveredAt: true,
            failedAt: true,
            retryCount: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.notification.count({ where }),
      ]);

      return {
        data: notifications,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      this.logger.error('Failed to search notifications:', error);
      throw error;
    }
  }

  /**
   * POST /admin/notifications/:id/retry - Manual retry failed notification
   */
  @Post('notifications/:id/retry')
  async retryNotification(@Param('id') id: string) {
    this.logger.log(`Manual retry requested for notification: ${id}`);

    try {
      const notification = await this.prisma.notification.findUnique({
        where: { id },
      });

      if (!notification) {
        return { success: false, error: 'Notification not found' };
      }

      if (notification.status !== 'FAILED') {
        return {
          success: false,
          error: `Cannot retry notification with status: ${notification.status}`,
        };
      }

      // Reset notification for retry
      await this.prisma.notification.update({
        where: { id },
        data: {
          status: 'PENDING',
          retryCount: 0,
          errorMessage: null,
          failedAt: null,
        },
      });

      this.logger.log(`Notification ${id} reset for retry`);

      return {
        success: true,
        message: 'Notification queued for retry',
        notificationId: id,
      };
    } catch (error) {
      this.logger.error(`Failed to retry notification ${id}:`, error);
      throw error;
    }
  }

  /**
   * GET /admin/dlq - View dead letter queue
   */
  @Get('dlq')
  async getDeadLetterQueue(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    this.logger.log('Fetching dead letter queue');

    try {
      // Get DLQ keys from Redis
      const dlqKeys = await this.redis.keys('dlq:*');

      const pageNum = parseInt(page, 10);
      const limitNum = Math.min(parseInt(limit, 10), 100);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;

      const paginatedKeys = dlqKeys.slice(startIndex, endIndex);

      const dlqEntries = await Promise.all(
        paginatedKeys.map(async (key) => {
          const data = await this.redis.get<any>(key);
          return {
            key,
            data,
            timestamp: data?.timestamp || null,
          };
        }),
      );

      return {
        data: dlqEntries,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: dlqKeys.length,
          totalPages: Math.ceil(dlqKeys.length / limitNum),
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch DLQ:', error);
      throw error;
    }
  }

  /**
   * GET /admin/users - List all users with their roles
   */
  @Get('users')
  async listUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    this.logger.log('Fetching user list');

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const skip = (pageNum - 1) * limitNum;

    try {
      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          take: limitNum,
          skip,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                notifications: true,
                events: true,
              },
            },
          },
        }),
        this.prisma.user.count(),
      ]);

      return {
        data: users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      this.logger.error('Failed to list users:', error);
      throw error;
    }
  }

  /**
   * GET /admin/dashboard - Dashboard summary data
   */
  @Get('dashboard')
  async getDashboardData() {
    this.logger.log('Fetching dashboard data');

    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        totalNotifications,
        totalEvents,
        recentNotifications,
        recentEvents,
        weekNotifications,
        failedNotifications,
        pendingNotifications,
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.notification.count(),
        this.prisma.event.count(),
        this.prisma.notification.count({
          where: { createdAt: { gte: dayAgo } },
        }),
        this.prisma.event.count({ where: { createdAt: { gte: dayAgo } } }),
        this.prisma.notification.count({
          where: { createdAt: { gte: weekAgo } },
        }),
        this.prisma.notification.count({ where: { status: 'FAILED' } }),
        this.prisma.notification.count({ where: { status: 'PENDING' } }),
      ]);

      return {
        timestamp: new Date().toISOString(),
        totals: {
          users: totalUsers,
          notifications: totalNotifications,
          events: totalEvents,
        },
        activity: {
          last24Hours: {
            notifications: recentNotifications,
            events: recentEvents,
          },
          last7Days: {
            notifications: weekNotifications,
          },
        },
        queue: {
          pending: pendingNotifications,
          failed: failedNotifications,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch dashboard data:', error);
      throw error;
    }
  }
}
