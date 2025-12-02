import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';
import { NotificationProcessorService } from './notification-processor.service';
import { RetryService } from './retry.service';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationWorkerService,
    NotificationProcessorService,
    RetryService,
  ],
  exports: [NotificationService, NotificationWorkerService],
})
export class NotificationModule {}
