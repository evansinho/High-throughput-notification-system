import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';
import { NotificationModule } from './notification/notification.module';
import { JobsModule } from './jobs/jobs.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AdminModule } from './admin/admin.module';
import { DataPipelineModule } from './data-pipeline/data-pipeline.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { RATE_LIMIT } from './common/constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: true, // Stop on first error
      },
    }),
    PrismaModule,
    RedisModule,
    KafkaModule,
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: RATE_LIMIT.SHORT.TTL,
        limit: RATE_LIMIT.SHORT.LIMIT,
      },
      {
        name: 'medium',
        ttl: RATE_LIMIT.MEDIUM.TTL,
        limit: RATE_LIMIT.MEDIUM.LIMIT,
      },
      {
        name: 'long',
        ttl: RATE_LIMIT.LONG.TTL,
        limit: RATE_LIMIT.LONG.LIMIT,
      },
    ]),
    HealthModule,
    AuthModule,
    NotificationModule,
    JobsModule,
    IntegrationsModule,
    AdminModule,
    DataPipelineModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
