import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupService } from './cleanup.service';
import { MonitoringService } from './monitoring.service';
import { ArchivalJob } from './archival.job';
import { JobsController } from './jobs.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { KafkaModule } from '../kafka/kafka.module';
import { DataPipelineModule } from '../data-pipeline/data-pipeline.module';

/**
 * JobsModule - Scheduled background jobs
 *
 * Features:
 * - Cron-based scheduled tasks
 * - Interval-based monitoring
 * - Data cleanup and maintenance
 * - System health monitoring
 * - Performance tracking and reporting
 * - Daily archival (notifications, events)
 */
@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable scheduling
    PrismaModule,
    RedisModule,
    KafkaModule,
    DataPipelineModule,
  ],
  controllers: [JobsController],
  providers: [CleanupService, MonitoringService, ArchivalJob],
  exports: [CleanupService, MonitoringService, ArchivalJob],
})
export class JobsModule {}
