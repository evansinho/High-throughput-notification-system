import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupService } from './cleanup.service';
import { MonitoringService } from './monitoring.service';
import { JobsController } from './jobs.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { KafkaModule } from '../kafka/kafka.module';

/**
 * JobsModule - Scheduled background jobs
 *
 * Features:
 * - Cron-based scheduled tasks
 * - Interval-based monitoring
 * - Data cleanup and maintenance
 * - System health monitoring
 * - Performance tracking and reporting
 */
@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable scheduling
    PrismaModule,
    RedisModule,
    KafkaModule,
  ],
  controllers: [JobsController],
  providers: [CleanupService, MonitoringService],
  exports: [CleanupService, MonitoringService],
})
export class JobsModule {}
