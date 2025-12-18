import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * AI Analytics Service
 *
 * Handles storage and retrieval of AI interaction data for:
 * - Usage analytics
 * - Cost tracking per user/tenant
 * - Performance monitoring
 * - Admin dashboards
 */
@Injectable()
export class AIAnalyticsService {
  private readonly logger = new Logger(AIAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Store an AI interaction
   */
  async storeInteraction(data: StoreInteractionData): Promise<void> {
    try {
      await this.prisma.aIInteraction.create({
        data: {
          userId: data.userId,
          tenantId: data.tenantId,
          requestId: data.requestId,
          query: data.query,
          channel: data.channel,
          category: data.category,
          context: data.context as Prisma.InputJsonValue,
          topK: data.topK || 5,
          scoreThreshold: data.scoreThreshold || 0.7,
          temperature: data.temperature || 0.7,
          maxTokens: data.maxTokens || 1000,
          response: data.response,
          success: data.success,
          errorMessage: data.errorMessage,
          sources: data.sources as Prisma.InputJsonValue,
          sourcesCount: data.sourcesCount || 0,
          latencyMs: data.latencyMs,
          retrievalMs: data.retrievalMs,
          generationMs: data.generationMs,
          model: data.model,
          tokensInput: data.tokensInput || 0,
          tokensOutput: data.tokensOutput || 0,
          tokensTotal: data.tokensTotal || 0,
          cost: data.cost || 0,
          endpoint: data.endpoint || 'generate-notification',
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          correlationId: data.correlationId,
        },
      });

      this.logger.log(`Stored AI interaction ${data.requestId} for user ${data.userId}`);
    } catch (error) {
      this.logger.error(`Failed to store AI interaction: ${error.message}`, error.stack);
      // Don't throw - we don't want to fail the request if storage fails
    }
  }

  /**
   * Get user usage statistics
   */
  async getUserStats(userId: string, startDate?: Date, endDate?: Date) {
    const where: Prisma.AIInteractionWhereInput = {
      userId,
      ...(startDate && endDate ? {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      } : {}),
    };

    const [totalInteractions, successfulInteractions, failedInteractions, aggregates] = await Promise.all([
      // Total interactions
      this.prisma.aIInteraction.count({ where }),

      // Successful interactions
      this.prisma.aIInteraction.count({
        where: { ...where, success: true },
      }),

      // Failed interactions
      this.prisma.aIInteraction.count({
        where: { ...where, success: false },
      }),

      // Aggregates
      this.prisma.aIInteraction.aggregate({
        where,
        _sum: {
          tokensTotal: true,
          cost: true,
        },
        _avg: {
          latencyMs: true,
          cost: true,
        },
      }),
    ]);

    return {
      totalInteractions,
      successfulInteractions,
      failedInteractions,
      successRate: totalInteractions > 0 ? (successfulInteractions / totalInteractions) * 100 : 0,
      totalTokens: aggregates._sum.tokensTotal || 0,
      totalCost: aggregates._sum.cost || 0,
      avgLatency: aggregates._avg.latencyMs || 0,
      avgCost: aggregates._avg.cost || 0,
    };
  }

  /**
   * Get tenant usage statistics
   */
  async getTenantStats(tenantId: string, startDate?: Date, endDate?: Date) {
    const where: Prisma.AIInteractionWhereInput = {
      tenantId,
      ...(startDate && endDate ? {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      } : {}),
    };

    const [totalInteractions, uniqueUsers, aggregates] = await Promise.all([
      // Total interactions
      this.prisma.aIInteraction.count({ where }),

      // Unique users
      this.prisma.aIInteraction.groupBy({
        by: ['userId'],
        where,
      }),

      // Aggregates
      this.prisma.aIInteraction.aggregate({
        where,
        _sum: {
          tokensTotal: true,
          cost: true,
        },
        _avg: {
          latencyMs: true,
        },
      }),
    ]);

    return {
      totalInteractions,
      uniqueUsers: uniqueUsers.length,
      totalTokens: aggregates._sum.tokensTotal || 0,
      totalCost: aggregates._sum.cost || 0,
      avgLatency: aggregates._avg.latencyMs || 0,
      avgCostPerInteraction: totalInteractions > 0 ? (aggregates._sum.cost || 0) / totalInteractions : 0,
    };
  }

  /**
   * Get channel/category breakdown
   */
  async getChannelCategoryStats(userId?: string, tenantId?: string, startDate?: Date, endDate?: Date) {
    const where: Prisma.AIInteractionWhereInput = {
      ...(userId ? { userId } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(startDate && endDate ? {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      } : {}),
    };

    const [channelStats, categoryStats] = await Promise.all([
      // By channel
      this.prisma.aIInteraction.groupBy({
        by: ['channel'],
        where: { ...where, channel: { not: null } },
        _count: true,
        _sum: {
          cost: true,
          tokensTotal: true,
        },
      }),

      // By category
      this.prisma.aIInteraction.groupBy({
        by: ['category'],
        where: { ...where, category: { not: null } },
        _count: true,
        _sum: {
          cost: true,
          tokensTotal: true,
        },
      }),
    ]);

    return {
      byChannel: channelStats.map(stat => ({
        channel: stat.channel,
        count: stat._count,
        totalCost: stat._sum.cost || 0,
        totalTokens: stat._sum.tokensTotal || 0,
      })),
      byCategory: categoryStats.map(stat => ({
        category: stat.category,
        count: stat._count,
        totalCost: stat._sum.cost || 0,
        totalTokens: stat._sum.tokensTotal || 0,
      })),
    };
  }

  /**
   * Get cost breakdown by model
   */
  async getModelCostBreakdown(userId?: string, tenantId?: string, startDate?: Date, endDate?: Date) {
    const where: Prisma.AIInteractionWhereInput = {
      ...(userId ? { userId } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(startDate && endDate ? {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      } : {}),
    };

    const modelStats = await this.prisma.aIInteraction.groupBy({
      by: ['model'],
      where: { ...where, model: { not: null } },
      _count: true,
      _sum: {
        cost: true,
        tokensInput: true,
        tokensOutput: true,
        tokensTotal: true,
      },
      _avg: {
        latencyMs: true,
        cost: true,
      },
    });

    return modelStats.map(stat => ({
      model: stat.model,
      requests: stat._count,
      totalCost: stat._sum.cost || 0,
      avgCost: stat._avg.cost || 0,
      totalTokensInput: stat._sum.tokensInput || 0,
      totalTokensOutput: stat._sum.tokensOutput || 0,
      totalTokens: stat._sum.tokensTotal || 0,
      avgLatency: stat._avg.latencyMs || 0,
    }));
  }

  /**
   * Get daily usage trends
   */
  async getDailyTrends(userId?: string, tenantId?: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: Prisma.AIInteractionWhereInput = {
      ...(userId ? { userId } : {}),
      ...(tenantId ? { tenantId } : {}),
      createdAt: {
        gte: startDate,
      },
    };

    const interactions = await this.prisma.aIInteraction.findMany({
      where,
      select: {
        createdAt: true,
        cost: true,
        tokensTotal: true,
        success: true,
        latencyMs: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by day
    const dailyData = new Map<string, {
      date: string;
      requests: number;
      successfulRequests: number;
      totalCost: number;
      totalTokens: number;
      avgLatency: number;
      latencies: number[];
    }>();

    interactions.forEach(interaction => {
      const dateKey = interaction.createdAt.toISOString().split('T')[0];

      if (!dailyData.has(dateKey)) {
        dailyData.set(dateKey, {
          date: dateKey,
          requests: 0,
          successfulRequests: 0,
          totalCost: 0,
          totalTokens: 0,
          avgLatency: 0,
          latencies: [],
        });
      }

      const data = dailyData.get(dateKey)!;
      data.requests++;
      if (interaction.success) data.successfulRequests++;
      data.totalCost += interaction.cost;
      data.totalTokens += interaction.tokensTotal;
      data.latencies.push(interaction.latencyMs);
    });

    // Calculate averages
    const trends = Array.from(dailyData.values()).map(data => ({
      date: data.date,
      requests: data.requests,
      successfulRequests: data.successfulRequests,
      successRate: data.requests > 0 ? (data.successfulRequests / data.requests) * 100 : 0,
      totalCost: data.totalCost,
      totalTokens: data.totalTokens,
      avgLatency: data.latencies.length > 0 ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length : 0,
    }));

    return trends;
  }

  /**
   * Get top users by cost
   */
  async getTopUsersByCost(tenantId?: string, limit: number = 10, startDate?: Date, endDate?: Date) {
    const where: Prisma.AIInteractionWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(startDate && endDate ? {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      } : {}),
    };

    const userStats = await this.prisma.aIInteraction.groupBy({
      by: ['userId'],
      where,
      _count: true,
      _sum: {
        cost: true,
        tokensTotal: true,
      },
      orderBy: {
        _sum: {
          cost: 'desc',
        },
      },
      take: limit,
    });

    return userStats.map(stat => ({
      userId: stat.userId,
      requests: stat._count,
      totalCost: stat._sum.cost || 0,
      totalTokens: stat._sum.tokensTotal || 0,
    }));
  }

  /**
   * Get user interaction history
   */
  async getUserHistory(userId: string, limit: number = 50, offset: number = 0) {
    const [interactions, total] = await Promise.all([
      this.prisma.aIInteraction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          requestId: true,
          query: true,
          channel: true,
          category: true,
          response: true,
          success: true,
          errorMessage: true,
          sourcesCount: true,
          latencyMs: true,
          model: true,
          tokensTotal: true,
          cost: true,
          createdAt: true,
        },
      }),
      this.prisma.aIInteraction.count({ where: { userId } }),
    ]);

    return {
      interactions,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get failed interactions for debugging
   */
  async getFailedInteractions(userId?: string, limit: number = 20) {
    const where: Prisma.AIInteractionWhereInput = {
      success: false,
      ...(userId ? { userId } : {}),
    };

    return this.prisma.aIInteraction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        requestId: true,
        userId: true,
        query: true,
        channel: true,
        category: true,
        errorMessage: true,
        latencyMs: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get overall system statistics
   */
  async getSystemStats(startDate?: Date, endDate?: Date) {
    const where: Prisma.AIInteractionWhereInput = {
      ...(startDate && endDate ? {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      } : {}),
    };

    const [
      totalInteractions,
      successfulInteractions,
      uniqueUsers,
      uniqueTenants,
      aggregates,
    ] = await Promise.all([
      this.prisma.aIInteraction.count({ where }),
      this.prisma.aIInteraction.count({ where: { ...where, success: true } }),
      this.prisma.aIInteraction.groupBy({ by: ['userId'], where }),
      this.prisma.aIInteraction.groupBy({ by: ['tenantId'], where: { ...where, tenantId: { not: null } } }),
      this.prisma.aIInteraction.aggregate({
        where,
        _sum: {
          tokensTotal: true,
          cost: true,
        },
        _avg: {
          latencyMs: true,
          cost: true,
        },
      }),
    ]);

    return {
      totalInteractions,
      successfulInteractions,
      failedInteractions: totalInteractions - successfulInteractions,
      successRate: totalInteractions > 0 ? (successfulInteractions / totalInteractions) * 100 : 0,
      uniqueUsers: uniqueUsers.length,
      uniqueTenants: uniqueTenants.length,
      totalTokens: aggregates._sum.tokensTotal || 0,
      totalCost: aggregates._sum.cost || 0,
      avgLatency: aggregates._avg.latencyMs || 0,
      avgCost: aggregates._avg.cost || 0,
    };
  }
}

/**
 * Interface for storing interaction data
 */
export interface StoreInteractionData {
  userId: string;
  tenantId?: string;
  requestId: string;
  query: string;
  channel?: string;
  category?: string;
  context?: any;
  topK?: number;
  scoreThreshold?: number;
  temperature?: number;
  maxTokens?: number;
  response?: string;
  success: boolean;
  errorMessage?: string;
  sources?: any;
  sourcesCount?: number;
  latencyMs: number;
  retrievalMs?: number;
  generationMs?: number;
  model?: string;
  tokensInput?: number;
  tokensOutput?: number;
  tokensTotal?: number;
  cost?: number;
  endpoint?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}