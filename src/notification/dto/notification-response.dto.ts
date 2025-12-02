import {
  NotificationChannel,
  NotificationType,
  NotificationPriority,
} from './create-notification.dto';

export enum NotificationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SCHEDULED = 'SCHEDULED',
}

export class NotificationResponseDto {
  id!: string;
  userId!: string;
  tenantId?: string;
  channel!: NotificationChannel;
  type!: NotificationType;
  priority!: NotificationPriority;
  status!: NotificationStatus;
  scheduledFor?: Date;
  createdAt!: Date;
  updatedAt!: Date;
  correlationId?: string;
  idempotencyKey?: string;
}
