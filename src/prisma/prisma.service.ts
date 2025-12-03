import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Connection pool configuration
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Log configuration for query monitoring
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    });

    // Log slow queries (>100ms)
    this.$on('query' as never, (e: any) => {
      if (e.duration > 100) {
        this.logger.warn(
          `Slow query detected (${e.duration}ms): ${e.query.substring(0, 200)}`,
        );
      }
    });

    // Log errors
    this.$on('error' as never, (e: any) => {
      this.logger.error('Database error:', e);
    });

    // Log warnings
    this.$on('warn' as never, (e: any) => {
      this.logger.warn('Database warning:', e);
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Get connection pool metrics
   */
  async getPoolMetrics() {
    // Prisma doesn't expose pool metrics directly, but we can get basic stats
    const result = await this.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database()
    `;

    return {
      activeConnections: Number(result[0].count),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Health check for database
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }
}
