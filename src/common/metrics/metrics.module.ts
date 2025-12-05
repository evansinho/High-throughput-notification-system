import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

/**
 * MetricsModule - Global module for Prometheus metrics
 *
 * Makes MetricsService available throughout the application
 * and exposes /metrics endpoint for Prometheus scraping
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
