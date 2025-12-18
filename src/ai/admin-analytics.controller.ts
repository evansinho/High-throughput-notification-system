import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AIAnalyticsService } from './services/ai-analytics.service';

/**
 * Admin Analytics Controller
 * Provides comprehensive analytics endpoints for AI/RAG usage
 *
 * All endpoints require JWT authentication
 * Consider adding role-based access control for production (ADMIN role only)
 */
@Controller('admin/ai-analytics')
@UseGuards(JwtAuthGuard)
export class AdminAnalyticsController {
  private readonly logger = new Logger(AdminAnalyticsController.name);

  constructor(private readonly analyticsService: AIAnalyticsService) {}

  /**
   * Get user usage statistics
   * GET /admin/ai-analytics/users/:userId/stats
   */
  @Get('users/stats')
  async getUserStats(
    @Query('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const stats = await this.analyticsService.getUserStats(userId, start, end);

    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Get tenant usage statistics
   * GET /admin/ai-analytics/tenants/:tenantId/stats
   */
  @Get('tenants/stats')
  async getTenantStats(
    @Query('tenantId') tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const stats = await this.analyticsService.getTenantStats(tenantId, start, end);

    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Get channel/category breakdown
   * GET /admin/ai-analytics/breakdown
   */
  @Get('breakdown')
  async getBreakdown(
    @Query('userId') userId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const breakdown = await this.analyticsService.getChannelCategoryStats(
      userId,
      tenantId,
      start,
      end,
    );

    return {
      success: true,
      data: breakdown,
    };
  }

  /**
   * Get cost breakdown by model
   * GET /admin/ai-analytics/model-costs
   */
  @Get('model-costs')
  async getModelCosts(
    @Query('userId') userId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const costs = await this.analyticsService.getModelCostBreakdown(
      userId,
      tenantId,
      start,
      end,
    );

    return {
      success: true,
      data: costs,
    };
  }

  /**
   * Get daily usage trends
   * GET /admin/ai-analytics/trends
   */
  @Get('trends')
  async getDailyTrends(
    @Query('userId') userId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    const trends = await this.analyticsService.getDailyTrends(
      userId,
      tenantId,
      days || 30,
    );

    return {
      success: true,
      data: trends,
    };
  }

  /**
   * Get top users by cost
   * GET /admin/ai-analytics/top-users
   */
  @Get('top-users')
  async getTopUsers(
    @Query('tenantId') tenantId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const topUsers = await this.analyticsService.getTopUsersByCost(
      tenantId,
      limit || 10,
      start,
      end,
    );

    return {
      success: true,
      data: topUsers,
    };
  }

  /**
   * Get user interaction history
   * GET /admin/ai-analytics/users/:userId/history
   */
  @Get('users/history')
  async getUserHistory(
    @Query('userId') userId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    const history = await this.analyticsService.getUserHistory(
      userId,
      limit || 50,
      offset || 0,
    );

    return {
      success: true,
      data: history,
    };
  }

  /**
   * Get failed interactions
   * GET /admin/ai-analytics/failures
   */
  @Get('failures')
  async getFailures(
    @Query('userId') userId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const failures = await this.analyticsService.getFailedInteractions(
      userId,
      limit || 20,
    );

    return {
      success: true,
      data: failures,
    };
  }

  /**
   * Get overall system statistics
   * GET /admin/ai-analytics/system
   */
  @Get('system')
  async getSystemStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const stats = await this.analyticsService.getSystemStats(start, end);

    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Get comprehensive admin dashboard data
   * GET /admin/ai-analytics/dashboard
   */
  @Get('dashboard')
  async getDashboard(
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    const daysToFetch = days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToFetch);
    const endDate = new Date();

    // Fetch all dashboard data in parallel
    const [systemStats, trends, topUsers, modelCosts, breakdown, failures] =
      await Promise.all([
        this.analyticsService.getSystemStats(startDate, endDate),
        this.analyticsService.getDailyTrends(undefined, undefined, daysToFetch),
        this.analyticsService.getTopUsersByCost(undefined, 10, startDate, endDate),
        this.analyticsService.getModelCostBreakdown(undefined, undefined, startDate, endDate),
        this.analyticsService.getChannelCategoryStats(undefined, undefined, startDate, endDate),
        this.analyticsService.getFailedInteractions(undefined, 10),
      ]);

    return {
      success: true,
      data: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: daysToFetch,
        },
        overview: systemStats,
        trends,
        topUsers,
        modelCosts,
        breakdown,
        recentFailures: failures,
      },
    };
  }
}
