import {
  Controller,
  Post,
  Body,
  Get,
  Logger,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { LLMService } from './services/llm.service';
import { CostTrackingService } from './services/cost-tracking.service';
import { RAGGenerationService } from './services/rag-generation.service';
import { AIAnalyticsService } from './services/ai-analytics.service';
import { LLMPrompt, LLMMetrics } from './interfaces/llm.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AIRateLimiterGuard } from './guards/ai-rate-limiter.guard';
import {
  GenerateAINotificationDto,
  GenerateAINotificationResponse,
} from './dto/ai-generation.dto';
import { randomUUID } from 'crypto';

/**
 * AI Controller - Production AI endpoints with authentication and rate limiting
 */
@Controller('ai')
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly costTrackingService: CostTrackingService,
    private readonly ragService: RAGGenerationService,
    private readonly analyticsService: AIAnalyticsService,
  ) {}

  /**
   * Production endpoint: Generate notification using RAG
   * - JWT authentication required
   * - Rate limited: 10 requests per minute
   * - Input validation enforced
   * - Full cost tracking and metrics
   */
  @Post('generate-notification')
  @UseGuards(JwtAuthGuard, AIRateLimiterGuard)
  @HttpCode(HttpStatus.OK)
  async generateNotification(
    @Body() dto: GenerateAINotificationDto,
    @Req() req: any,
  ): Promise<GenerateAINotificationResponse> {
    const requestId = randomUUID();
    const userId = req.user?.id || req.user?.sub || 'unknown';
    const startTime = Date.now();

    this.logger.log(
      `AI generation request ${requestId} from user ${userId}: "${dto.query.substring(0, 50)}..."`,
    );

    try {
      // Build query with context
      let query = dto.query;
      if (dto.channel || dto.category) {
        const filters: string[] = [];
        if (dto.channel) filters.push(`channel: ${dto.channel}`);
        if (dto.category) filters.push(`category: ${dto.category}`);
        query = `${dto.query} [${filters.join(', ')}]`;
      }

      // Build RAG filter
      const filter: any = {};
      if (dto.channel) filter.channel = dto.channel;
      if (dto.category) filter.category = dto.category;

      // Generate notification using RAG
      const result = await this.ragService.generate(query, {
        topK: dto.topK || 5,
        scoreThreshold: dto.scoreThreshold || 0.7,
        maxOutputTokens: dto.maxTokens || 1000,
        temperature: dto.temperature || 0.7,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });

      const totalTimeMs = Date.now() - startTime;

      // Track metrics
      const metric: LLMMetrics = {
        requestId,
        model: result.metadata.model || 'unknown',
        latencyMs: totalTimeMs,
        tokenUsage: {
          inputTokens: result.metadata.tokensUsed || 0,
          outputTokens: 0,
          totalTokens: result.metadata.tokensUsed || 0,
        },
        cost: result.metadata.cost || 0,
        success: true,
        timestamp: new Date(),
      };

      this.costTrackingService.trackRequest(metric);

      // Store interaction in database for analytics
      await this.analyticsService.storeInteraction({
        userId,
        requestId,
        query: dto.query,
        channel: dto.channel,
        category: dto.category,
        context: dto.context,
        topK: dto.topK,
        scoreThreshold: dto.scoreThreshold,
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
        response: result.content,
        success: true,
        sources: result.sources,
        sourcesCount: result.sources.length,
        latencyMs: totalTimeMs,
        model: result.metadata.model,
        tokensTotal: result.metadata.tokensUsed || 0,
        cost: result.metadata.cost || 0,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      this.logger.log(
        `AI generation ${requestId} completed in ${totalTimeMs}ms (${result.metadata.tokensUsed} tokens, $${result.metadata.cost?.toFixed(6)})`,
      );

      return {
        success: true,
        data: {
          notification: result.content,
          channel: dto.channel,
          category: dto.category,
          metadata: {
            retrievedCount: result.sources.length,
            generationTimeMs: totalTimeMs,
            tokensUsed: result.metadata.tokensUsed || 0,
            cost: result.metadata.cost || 0,
            sources: result.sources.map((s) => ({
              id: s.id,
              score: s.score,
              channel: s.channel,
              category: s.category,
            })),
          },
        },
        requestId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const totalTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Track failed request
      const metric: LLMMetrics = {
        requestId,
        model: 'unknown',
        latencyMs: totalTimeMs,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: 0,
        success: false,
        errorCode: errorMessage,
        timestamp: new Date(),
      };

      this.costTrackingService.trackRequest(metric);

      // Store failed interaction in database
      await this.analyticsService.storeInteraction({
        userId,
        requestId,
        query: dto.query,
        channel: dto.channel,
        category: dto.category,
        context: dto.context,
        topK: dto.topK,
        scoreThreshold: dto.scoreThreshold,
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
        success: false,
        errorMessage,
        latencyMs: totalTimeMs,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      this.logger.error(
        `AI generation ${requestId} failed after ${totalTimeMs}ms: ${errorMessage}`,
      );

      return {
        success: false,
        error: errorMessage,
        requestId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Test endpoint for LLM completion (no auth for testing)
   */
  @Post('completion')
  async generateCompletion(@Body() prompt: LLMPrompt) {
    const requestId = randomUUID();
    const startTime = Date.now();

    try {
      const response = await this.llmService.generateCompletion(prompt);
      const cost = this.llmService.calculateCost(response.usage);

      // Track metrics
      const metric: LLMMetrics = {
        requestId,
        model: response.model,
        latencyMs: response.latencyMs,
        tokenUsage: response.usage,
        cost,
        success: true,
        timestamp: new Date(),
      };

      this.costTrackingService.trackRequest(metric);

      return {
        success: true,
        requestId,
        response: response.content,
        metadata: {
          model: response.model,
          usage: response.usage,
          cost: cost.toFixed(6),
          latencyMs: response.latencyMs,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Track failed request
      const metric: LLMMetrics = {
        requestId,
        model: 'unknown',
        latencyMs,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: 0,
        success: false,
        errorCode: errorMessage,
        timestamp: new Date(),
      };

      this.costTrackingService.trackRequest(metric);

      this.logger.error(`LLM completion failed: ${errorMessage}`);

      return {
        success: false,
        requestId,
        error: errorMessage,
        metadata: {
          latencyMs,
        },
      };
    }
  }

  /**
   * Test LLM connection
   */
  @Get('health')
  async healthCheck() {
    try {
      const isHealthy = await this.llmService.testConnection();

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'anthropic-claude',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        status: 'unhealthy',
        service: 'anthropic-claude',
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get cost statistics
   */
  @Get('stats')
  async getStatistics() {
    const stats = this.costTrackingService.getStatistics();
    const costByModel = this.costTrackingService.getCostByModel();
    const requestsByModel = this.costTrackingService.getRequestsByModel();
    const errorBreakdown = this.costTrackingService.getErrorBreakdown();

    // Get today's cost
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCost = this.costTrackingService.getTotalCost(today);
    const todayTokens = this.costTrackingService.getTotalTokenUsage(today);

    return {
      overall: stats,
      today: {
        cost: todayCost.toFixed(6),
        tokens: todayTokens,
      },
      breakdown: {
        byModel: {
          requests: requestsByModel,
          costs: Object.entries(costByModel).reduce(
            (acc, [model, cost]) => {
              acc[model] = cost.toFixed(6);
              return acc;
            },
            {} as Record<string, string>,
          ),
        },
        errors: errorBreakdown,
      },
    };
  }
}
