import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { LLMService } from './services/llm.service';
import { CostTrackingService } from './services/cost-tracking.service';
import { LLMPrompt, LLMMetrics } from './interfaces/llm.interface';
import { randomUUID } from 'crypto';

/**
 * AI Controller - Endpoints for testing LLM functionality
 */
@Controller('ai')
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly costTrackingService: CostTrackingService,
  ) {}

  /**
   * Test endpoint for LLM completion
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
