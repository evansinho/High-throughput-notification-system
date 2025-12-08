import { Injectable, Logger } from '@nestjs/common';
import { LLMMetrics, TokenUsage } from '../interfaces/llm.interface';

/**
 * Cost Tracking Service - Tracks token usage and costs for LLM requests
 */
@Injectable()
export class CostTrackingService {
  private readonly logger = new Logger(CostTrackingService.name);
  private metrics: LLMMetrics[] = [];
  private readonly maxMetricsInMemory = 10000; // Keep last 10k requests in memory

  /**
   * Track an LLM request
   */
  trackRequest(metric: LLMMetrics): void {
    this.metrics.push(metric);

    // Log high-cost requests
    if (metric.cost > 0.01) {
      // > 1 cent
      this.logger.warn(
        `High-cost LLM request: ${metric.cost.toFixed(4)} USD (${metric.tokenUsage.totalTokens} tokens)`,
      );
    }

    // Keep only last N metrics in memory to prevent memory leak
    if (this.metrics.length > this.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-this.maxMetricsInMemory);
    }

    this.logger.debug(
      `LLM request tracked: ${metric.requestId} - Cost: $${metric.cost.toFixed(6)}`,
    );
  }

  /**
   * Get total cost for a time period
   */
  getTotalCost(startDate?: Date, endDate?: Date): number {
    let filtered = this.metrics;

    if (startDate) {
      filtered = filtered.filter((m) => m.timestamp >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((m) => m.timestamp <= endDate);
    }

    return filtered.reduce((sum, m) => sum + m.cost, 0);
  }

  /**
   * Get total token usage for a time period
   */
  getTotalTokenUsage(startDate?: Date, endDate?: Date): TokenUsage {
    let filtered = this.metrics;

    if (startDate) {
      filtered = filtered.filter((m) => m.timestamp >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((m) => m.timestamp <= endDate);
    }

    return filtered.reduce(
      (sum, m) => ({
        inputTokens: sum.inputTokens + m.tokenUsage.inputTokens,
        outputTokens: sum.outputTokens + m.tokenUsage.outputTokens,
        totalTokens: sum.totalTokens + m.tokenUsage.totalTokens,
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    );
  }

  /**
   * Get statistics summary
   */
  getStatistics(startDate?: Date, endDate?: Date) {
    let filtered = this.metrics;

    if (startDate) {
      filtered = filtered.filter((m) => m.timestamp >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((m) => m.timestamp <= endDate);
    }

    if (filtered.length === 0) {
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        successRate: 0,
        totalCost: 0,
        averageCost: 0,
        totalTokens: 0,
        averageTokens: 0,
        averageLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
      };
    }

    const successful = filtered.filter((m) => m.success);
    const failed = filtered.filter((m) => !m.success);

    // Calculate latency percentiles
    const sortedLatencies = filtered
      .map((m) => m.latencyMs)
      .sort((a, b) => a - b);
    const p50Index = Math.floor(sortedLatencies.length * 0.5);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    const totalCost = filtered.reduce((sum, m) => sum + m.cost, 0);
    const totalTokens = filtered.reduce(
      (sum, m) => sum + m.tokenUsage.totalTokens,
      0,
    );
    const totalLatency = filtered.reduce((sum, m) => sum + m.latencyMs, 0);

    return {
      totalRequests: filtered.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      successRate: successful.length / filtered.length,
      totalCost,
      averageCost: totalCost / filtered.length,
      totalTokens,
      averageTokens: totalTokens / filtered.length,
      averageLatency: totalLatency / filtered.length,
      p50Latency: sortedLatencies[p50Index] ?? 0,
      p95Latency: sortedLatencies[p95Index] ?? 0,
      p99Latency: sortedLatencies[p99Index] ?? 0,
    };
  }

  /**
   * Get requests by model
   */
  getRequestsByModel(): Record<string, number> {
    return this.metrics.reduce(
      (acc, m) => {
        acc[m.model] = (acc[m.model] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * Get cost by model
   */
  getCostByModel(): Record<string, number> {
    return this.metrics.reduce(
      (acc, m) => {
        acc[m.model] = (acc[m.model] || 0) + m.cost;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * Get error breakdown
   */
  getErrorBreakdown(): Record<string, number> {
    return this.metrics
      .filter((m) => !m.success && m.errorCode)
      .reduce(
        (acc, m) => {
          acc[m.errorCode!] = (acc[m.errorCode!] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.metrics = [];
    this.logger.log('All metrics cleared');
  }

  /**
   * Export metrics to JSON (for persistence or analysis)
   */
  exportMetrics(): LLMMetrics[] {
    return [...this.metrics];
  }
}
