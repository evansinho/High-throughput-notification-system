import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { NotificationWorkerService } from '../notification/notification-worker.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private workerService: NotificationWorkerService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150 MB
      () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024), // 150 MB
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.9,
        }), // 90% disk usage threshold
    ]);
  }

  @Get('liveness')
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
    ]);
  }

  @Get('worker')
  async workerHealth() {
    const metrics = await this.workerService.getHealthMetrics();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      worker: metrics,
    };
  }

  @Get('database')
  async databaseHealth() {
    const isHealthy = await this.prisma.healthCheck();
    const poolMetrics = await this.prisma.getPoolMetrics();

    return {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: {
        connected: isHealthy,
        pool: poolMetrics,
      },
    };
  }
}
