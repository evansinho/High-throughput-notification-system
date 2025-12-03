import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * CleanupService - Scheduled jobs for data cleanup
 *
 * Jobs:
 * - Daily cleanup of old notifications (>90 days)
 * - Retry queue cleanup (>7 days)
 * - Cache warming for frequently accessed data
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Daily Notification Cleanup
   * Runs every day at 2:00 AM
   * Deletes notifications older than 90 days
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'cleanup-old-notifications',
    timeZone: 'UTC',
  })
  async cleanupOldNotifications() {
    const startTime = Date.now();
    this.logger.log('Starting daily notification cleanup...');

    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await this.prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
          status: {
            in: ['SENT', 'FAILED'], // Only delete completed notifications
          },
        },
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `Cleanup completed: Deleted ${result.count} notifications in ${duration}ms`,
      );

      // Track cleanup metrics in Redis
      await this.redis.set(
        'metrics:cleanup:last_run',
        {
          timestamp: new Date().toISOString(),
          deletedCount: result.count,
          duration,
        },
        86400, // 24 hours TTL
      );
    } catch (error) {
      this.logger.error('Notification cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Retry Queue Cleanup
   * Runs every day at 3:00 AM
   * Removes retry queue entries older than 7 days
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'cleanup-retry-queue',
    timeZone: 'UTC',
  })
  async cleanupRetryQueue() {
    const startTime = Date.now();
    this.logger.log('Starting retry queue cleanup...');

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Clean up old retry queue entries from Redis
      const retryKeys = await this.redis.keys('retry:*');
      let deletedCount = 0;

      for (const key of retryKeys) {
        const data = await this.redis.get<{
          timestamp?: string;
          createdAt?: string;
        }>(key);
        if (data) {
          try {
            const createdAt = new Date(data.timestamp || data.createdAt || 0);

            if (createdAt < sevenDaysAgo) {
              await this.redis.del(key);
              deletedCount++;
            }
          } catch (parseError) {
            // If we can't parse the data, delete it
            await this.redis.del(key);
            deletedCount++;
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Retry queue cleanup completed: Deleted ${deletedCount} entries in ${duration}ms`,
      );

      // Track cleanup metrics
      await this.redis.set(
        'metrics:retry_cleanup:last_run',
        {
          timestamp: new Date().toISOString(),
          deletedCount,
          duration,
        },
        86400, // 24 hours TTL
      );
    } catch (error) {
      this.logger.error('Retry queue cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Cache Warming
   * Runs every hour
   * Preloads frequently accessed data into Redis cache
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'cache-warming',
    timeZone: 'UTC',
  })
  async warmCache() {
    const startTime = Date.now();
    this.logger.log('Starting cache warming...');

    try {
      // 1. Cache recent user notification counts
      const recentUsers = await this.prisma.notification.groupBy({
        by: ['userId'],
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 100, // Top 100 active users
      });

      for (const user of recentUsers) {
        const notificationCount = await this.prisma.notification.count({
          where: {
            userId: user.userId,
            status: 'PENDING',
          },
        });

        await this.redis.set(
          `cache:user:${user.userId}:pending_count`,
          notificationCount.toString(),
          3600, // 1 hour TTL
        );
      }

      // 2. Cache notification stats by channel
      const channelStats = await this.prisma.notification.groupBy({
        by: ['channel', 'status'],
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        _count: {
          id: true,
        },
      });

      await this.redis.set(
        'cache:stats:channel_breakdown',
        channelStats,
        3600, // 1 hour TTL
      );

      const duration = Date.now() - startTime;
      this.logger.log(`Cache warming completed in ${duration}ms`);

      // Track metrics
      await this.redis.set(
        'metrics:cache_warming:last_run',
        {
          timestamp: new Date().toISOString(),
          usersCached: recentUsers.length,
          duration,
        },
        3600, // 1 hour TTL
      );
    } catch (error) {
      this.logger.error('Cache warming failed:', error);
      throw error;
    }
  }

  /**
   * Get cleanup metrics
   */
  async getCleanupMetrics() {
    try {
      const notificationCleanup = await this.redis.get<{
        timestamp: string;
        deletedCount: number;
        duration: number;
      }>('metrics:cleanup:last_run');

      const retryCleanup = await this.redis.get<{
        timestamp: string;
        deletedCount: number;
        duration: number;
      }>('metrics:retry_cleanup:last_run');

      const cacheWarming = await this.redis.get<{
        timestamp: string;
        usersCached: number;
        duration: number;
      }>('metrics:cache_warming:last_run');

      return {
        notificationCleanup: notificationCleanup || null,
        retryCleanup: retryCleanup || null,
        cacheWarming: cacheWarming || null,
      };
    } catch (error) {
      this.logger.error('Failed to get cleanup metrics:', error);
      return null;
    }
  }
}
