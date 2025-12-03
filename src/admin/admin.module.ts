import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { KafkaModule } from '../kafka/kafka.module';

/**
 * AdminModule - Admin endpoints for system management
 *
 * Features:
 * - System health metrics
 * - Kafka queue statistics
 * - Notification search and management
 * - Manual retry functionality
 * - Dead letter queue viewing
 * - User management
 * - Dashboard data
 */
@Module({
  imports: [PrismaModule, RedisModule, KafkaModule],
  controllers: [AdminController],
})
export class AdminModule {}
