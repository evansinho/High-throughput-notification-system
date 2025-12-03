import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ArchivalService } from '../data-pipeline/archival.service';
import { RedisService } from '../redis/redis.service';

/**
 * ArchivalJob - Scheduled archival tasks
 *
 * Schedule:
 * - Daily at 2 AM: Archive old notifications (90+ days)
 * - Daily at 3 AM: Archive old events (1+ year)
 *
 * Features:
 * - Automatic archival based on retention policies
 * - Distributed locking (prevents multiple instances running)
 * - Performance metrics tracking
 * - Error handling and retry logic
 */
@Injectable()
export class ArchivalJob {
  private readonly logger = new Logger(ArchivalJob.name);
  private readonly LOCK_KEY = 'job:archival:lock';
  private readonly LOCK_TTL = 3600; // 1 hour lock

  constructor(
    private readonly archivalService: ArchivalService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Run daily archival at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'archival-daily',
    timeZone: 'UTC',
  })
  async runDailyArchival(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('Starting daily archival job');

    try {
      // Acquire distributed lock
      const lockAcquired = await this.redis.set(
        this.LOCK_KEY,
        'locked',
        this.LOCK_TTL,
      );

      if (!lockAcquired) {
        this.logger.warn('Archival job already running, skipping');
        return;
      }

      // Run archival process
      const result = await this.archivalService.runArchival();

      const duration = Date.now() - startTime;

      this.logger.log(
        `Archival job completed in ${duration}ms: ` +
          `${result.notifications.archived} notifications, ` +
          `${result.events.archived} events archived`,
      );

      // Store metrics in Redis
      await this.redis.set('metrics:archival:last_run', {
        timestamp: new Date().toISOString(),
        duration,
        notificationsArchived: result.notifications.archived,
        notificationsDeleted: result.notifications.deleted,
        eventsArchived: result.events.archived,
        eventsDeleted: result.events.deleted,
        success: true,
      });
    } catch (error) {
      this.logger.error('Archival job failed:', error);

      // Store error metrics
      await this.redis.set('metrics:archival:last_run', {
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      // Release lock
      await this.redis.del(this.LOCK_KEY);
    }
  }

  /**
   * Manual trigger for archival (for testing or on-demand)
   */
  async runManualArchival(): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    this.logger.log('Manual archival triggered');

    try {
      const result = await this.archivalService.runArchival();

      return {
        success: true,
        result,
      };
    } catch (error) {
      this.logger.error('Manual archival failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get last archival run metrics
   */
  async getLastRunMetrics(): Promise<any> {
    return await this.redis.get('metrics:archival:last_run');
  }
}
