import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * MetricsController - Expose Prometheus metrics endpoint
 *
 * GET /metrics - Returns metrics in Prometheus format
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async getMetrics(): Promise<string> {
    return await this.metricsService.getMetrics();
  }
}
