import { Controller, Get, Post, UseGuards, Logger } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * JobsController - Endpoints for job monitoring and manual execution
 */
@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly cleanupService: CleanupService,
    private readonly monitoringService: MonitoringService,
  ) {}

  /**
   * Get cleanup job metrics
   */
  @Get('cleanup/metrics')
  async getCleanupMetrics() {
    this.logger.log('Fetching cleanup metrics');
    return this.cleanupService.getCleanupMetrics();
  }

  /**
   * Get monitoring metrics (health checks, reports, performance)
   */
  @Get('monitoring/metrics')
  async getMonitoringMetrics() {
    this.logger.log('Fetching monitoring metrics');
    return this.monitoringService.getMonitoringMetrics();
  }

  /**
   * Get latest health check results
   */
  @Get('monitoring/health')
  async getLatestHealthCheck() {
    this.logger.log('Fetching latest health check');
    return this.monitoringService.getLatestHealthCheck();
  }

  /**
   * Manually trigger notification cleanup
   */
  @Post('cleanup/notifications')
  async triggerNotificationCleanup() {
    this.logger.log('Manual notification cleanup triggered');
    try {
      await this.cleanupService.cleanupOldNotifications();
      return {
        success: true,
        message: 'Notification cleanup completed',
      };
    } catch (error) {
      this.logger.error('Manual cleanup failed:', error);
      return {
        success: false,
        message: 'Notification cleanup failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Manually trigger retry queue cleanup
   */
  @Post('cleanup/retry-queue')
  async triggerRetryQueueCleanup() {
    this.logger.log('Manual retry queue cleanup triggered');
    try {
      await this.cleanupService.cleanupRetryQueue();
      return {
        success: true,
        message: 'Retry queue cleanup completed',
      };
    } catch (error) {
      this.logger.error('Manual retry cleanup failed:', error);
      return {
        success: false,
        message: 'Retry queue cleanup failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Manually trigger cache warming
   */
  @Post('cache/warm')
  async triggerCacheWarming() {
    this.logger.log('Manual cache warming triggered');
    try {
      await this.cleanupService.warmCache();
      return {
        success: true,
        message: 'Cache warming completed',
      };
    } catch (error) {
      this.logger.error('Manual cache warming failed:', error);
      return {
        success: false,
        message: 'Cache warming failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Manually trigger daily report generation
   */
  @Post('monitoring/generate-report')
  async triggerDailyReport() {
    this.logger.log('Manual daily report generation triggered');
    try {
      const report = await this.monitoringService.generateDailyReport();
      return {
        success: true,
        message: 'Daily report generated',
        report,
      };
    } catch (error) {
      this.logger.error('Manual report generation failed:', error);
      return {
        success: false,
        message: 'Report generation failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Manually trigger health check
   */
  @Post('monitoring/health-check')
  async triggerHealthCheck() {
    this.logger.log('Manual health check triggered');
    try {
      await this.monitoringService.checkExternalServices();
      return {
        success: true,
        message: 'Health check completed',
        results: this.monitoringService.getLatestHealthCheck(),
      };
    } catch (error) {
      this.logger.error('Manual health check failed:', error);
      return {
        success: false,
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get job execution status
   */
  @Get('status')
  async getJobStatus() {
    this.logger.log('Fetching job execution status');

    const [cleanupMetrics, monitoringMetrics] = await Promise.all([
      this.cleanupService.getCleanupMetrics(),
      this.monitoringService.getMonitoringMetrics(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      cleanup: cleanupMetrics,
      monitoring: monitoringMetrics,
      jobs: {
        scheduled: [
          {
            name: 'cleanup-old-notifications',
            schedule: 'Daily at 2:00 AM UTC',
            status: 'active',
          },
          {
            name: 'cleanup-retry-queue',
            schedule: 'Daily at 3:00 AM UTC',
            status: 'active',
          },
          {
            name: 'cache-warming',
            schedule: 'Every hour',
            status: 'active',
          },
          {
            name: 'daily-stats-report',
            schedule: 'Daily at 6:00 AM UTC',
            status: 'active',
          },
          {
            name: 'external-services-health',
            schedule: 'Every 5 minutes',
            status: 'active',
          },
          {
            name: 'system-performance-monitoring',
            schedule: 'Every 15 minutes',
            status: 'active',
          },
        ],
      },
    };
  }
}
