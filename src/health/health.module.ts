import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [TerminusModule, NotificationModule],
  controllers: [HealthController],
})
export class HealthModule {}
