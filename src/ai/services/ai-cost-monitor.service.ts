import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AIAnalyticsService } from './ai-analytics.service';
import { AIObservabilityService } from './ai-observability.service';

/**
 * AI Cost Monitor Service
 *
 * Monitors daily AI costs and triggers alerts when thresholds are exceeded.
 * Runs scheduled checks every hour and provides manual check capability.
 */
@Injectable()
export class AICostMonitorService {
  private readonly logger = new Logger(AICostMonitorService.name);
  private readonly DEFAULT_DAILY_THRESHOLD = 100; // $100 per day
  private readonly WARNING_THRESHOLD = 80; // $80 per day (80% of limit)

  private lastAlertDate: string | null = null;
  private lastWarningDate: string | null = null;

  constructor(
    private readonly analyticsService: AIAnalyticsService,
    private readonly observabilityService: AIObservabilityService,
  ) {
    this.logger.log('AI Cost Monitor Service initialized');
    this.logger.log(`Daily cost threshold: $${this.DEFAULT_DAILY_THRESHOLD}`);
    this.logger.log(`Warning threshold: $${this.WARNING_THRESHOLD}`);
  }

  /**
   * Check daily costs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkDailyCosts(): Promise<void> {
    try {
      this.logger.debug('Running scheduled daily cost check...');

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      // Get today's stats
      const stats = await this.analyticsService.getSystemStats(startOfDay, endOfDay);

      if (!stats) {
        this.logger.warn('Failed to retrieve daily stats');
        return;
      }

      const dailyCost = stats.totalCost;
      const todayStr = startOfDay.toISOString().split('T')[0];

      // Update Prometheus gauge
      this.observabilityService.updateDailyCost(todayStr, dailyCost);

      this.logger.debug(
        `Daily cost check complete: $${dailyCost.toFixed(2)} (${stats.totalInteractions} requests)`,
      );

      // Check alert threshold
      if (dailyCost >= this.DEFAULT_DAILY_THRESHOLD) {
        if (this.lastAlertDate !== todayStr) {
          await this.triggerCostAlert(dailyCost, stats.totalInteractions);
          this.lastAlertDate = todayStr;
        }
      }
      // Check warning threshold
      else if (dailyCost >= this.WARNING_THRESHOLD) {
        if (this.lastWarningDate !== todayStr) {
          await this.triggerCostWarning(dailyCost, stats.totalInteractions);
          this.lastWarningDate = todayStr;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error during daily cost check: ${errorMessage}`, error);
    }
  }

  /**
   * Manually check current daily costs
   */
  async checkCurrentDailyCost(): Promise<DailyCostStatus> {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      const stats = await this.analyticsService.getSystemStats(startOfDay, endOfDay);

      if (!stats) {
        throw new Error('Failed to retrieve daily stats');
      }

      const dailyCost = stats.totalCost;
      const percentOfThreshold = (dailyCost / this.DEFAULT_DAILY_THRESHOLD) * 100;

      let status: 'ok' | 'warning' | 'alert';
      if (dailyCost >= this.DEFAULT_DAILY_THRESHOLD) {
        status = 'alert';
      } else if (dailyCost >= this.WARNING_THRESHOLD) {
        status = 'warning';
      } else {
        status = 'ok';
      }

      return {
        date: startOfDay.toISOString().split('T')[0],
        currentCost: dailyCost,
        threshold: this.DEFAULT_DAILY_THRESHOLD,
        warningThreshold: this.WARNING_THRESHOLD,
        percentOfThreshold,
        status,
        totalRequests: stats.totalInteractions,
        successRate: stats.successRate,
        avgCostPerRequest: stats.avgCost,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking daily cost: ${errorMessage}`, error);
      throw error;
    }
  }

  /**
   * Get cost statistics for the last N days
   */
  async getCostHistory(days: number = 7): Promise<DailyCostSummary[]> {
    try {
      const trends = await this.analyticsService.getDailyTrends(undefined, undefined, days);

      return trends.map((trend) => ({
        date: trend.date,
        cost: trend.totalCost,
        requests: trend.requests,
        successRate: trend.successRate,
        avgCostPerRequest: trend.requests > 0 ? trend.totalCost / trend.requests : 0,
        status: this.getCostStatus(trend.totalCost),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting cost history: ${errorMessage}`, error);
      throw error;
    }
  }

  /**
   * Trigger cost alert (threshold exceeded)
   */
  private async triggerCostAlert(cost: number, requests: number): Promise<void> {
    this.logger.error(
      `🚨 COST ALERT: Daily AI cost ($${cost.toFixed(2)}) EXCEEDS threshold ($${this.DEFAULT_DAILY_THRESHOLD.toFixed(2)})`,
    );
    this.logger.error(`  - Total requests: ${requests}`);
    this.logger.error(`  - Average cost per request: $${(cost / requests).toFixed(4)}`);
    this.logger.error(`  - Threshold exceeded by: $${(cost - this.DEFAULT_DAILY_THRESHOLD).toFixed(2)}`);

    // Check with observability service
    await this.observabilityService.checkCostAlert(cost, this.DEFAULT_DAILY_THRESHOLD);

    // In production, trigger:
    // - PagerDuty/OpsGenie incident
    // - Slack alert to #ai-alerts channel
    // - Email to engineering managers
    // - Auto-scale down AI features (feature flags)
    // - Rate limit aggressive users
  }

  /**
   * Trigger cost warning (80% of threshold)
   */
  private async triggerCostWarning(cost: number, requests: number): Promise<void> {
    this.logger.warn(
      `⚠️  COST WARNING: Daily AI cost ($${cost.toFixed(2)}) exceeds ${((cost / this.DEFAULT_DAILY_THRESHOLD) * 100).toFixed(0)}% of threshold`,
    );
    this.logger.warn(`  - Total requests: ${requests}`);
    this.logger.warn(`  - Average cost per request: $${(cost / requests).toFixed(4)}`);
    this.logger.warn(
      `  - Remaining budget: $${(this.DEFAULT_DAILY_THRESHOLD - cost).toFixed(2)}`,
    );

    // In production, trigger:
    // - Slack notification to #ai-monitoring channel
    // - Dashboard alert
    // - Start monitoring more aggressively
  }

  /**
   * Get cost status for a given cost
   */
  private getCostStatus(cost: number): 'ok' | 'warning' | 'alert' {
    if (cost >= this.DEFAULT_DAILY_THRESHOLD) {
      return 'alert';
    } else if (cost >= this.WARNING_THRESHOLD) {
      return 'warning';
    }
    return 'ok';
  }

  /**
   * Update threshold (for testing or dynamic adjustment)
   */
  updateThreshold(newThreshold: number): void {
    this.logger.log(`Updating daily cost threshold from $${this.DEFAULT_DAILY_THRESHOLD} to $${newThreshold}`);
    // In a real implementation, this would update a configuration value
    // For now, just log it
  }
}

/**
 * Daily Cost Status
 */
export interface DailyCostStatus {
  date: string;
  currentCost: number;
  threshold: number;
  warningThreshold: number;
  percentOfThreshold: number;
  status: 'ok' | 'warning' | 'alert';
  totalRequests: number;
  successRate: number;
  avgCostPerRequest: number;
}

/**
 * Daily Cost Summary
 */
export interface DailyCostSummary {
  date: string;
  cost: number;
  requests: number;
  successRate: number;
  avgCostPerRequest: number;
  status: 'ok' | 'warning' | 'alert';
}