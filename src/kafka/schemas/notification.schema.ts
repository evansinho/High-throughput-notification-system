/**
 * Notification Event Schema
 * Version: 1.0.0
 *
 * This schema defines the structure of notification messages sent through Kafka.
 * It supports schema evolution with versioning.
 */

export enum NotificationType {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH',
  IN_APP = 'IN_APP',
  WEBHOOK = 'WEBHOOK',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH_IOS = 'PUSH_IOS',
  PUSH_ANDROID = 'PUSH_ANDROID',
  IN_APP = 'IN_APP',
  WEBHOOK = 'WEBHOOK',
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Base notification message structure
 */
export interface NotificationMessage {
  // Metadata
  id: string;
  version: string; // Schema version (e.g., "1.0.0")
  timestamp: number; // Unix timestamp in milliseconds
  idempotencyKey: string; // For duplicate detection

  // User information
  userId: string;
  tenantId?: string; // For multi-tenancy support

  // Notification details
  type: NotificationType;
  channel: NotificationChannel;
  priority: NotificationPriority;
  status: NotificationStatus;

  // Scheduling
  scheduledFor?: number; // Unix timestamp (null = send immediately)
  expiresAt?: number; // Unix timestamp (message expires if not sent)

  // Content
  payload: NotificationPayload;

  // Tracking
  correlationId?: string; // For distributed tracing
  causationId?: string; // ID of the event that caused this notification

  // Retry information (populated by consumer on failure)
  retryCount?: number;
  lastAttemptAt?: number;
  errorMessage?: string;
}

/**
 * Notification payload (content)
 */
export interface NotificationPayload {
  // Generic fields
  subject?: string;
  body: string;
  template?: string; // Template ID for dynamic content
  templateData?: Record<string, unknown>; // Variables for template

  // Channel-specific metadata
  metadata?: Record<string, unknown>;

  // Email-specific
  from?: string;
  to?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Attachment[];

  // SMS-specific
  phoneNumber?: string;

  // Push notification-specific
  title?: string;
  icon?: string;
  badge?: number;
  sound?: string;
  clickAction?: string;
  deepLink?: string;

  // Webhook-specific
  webhookUrl?: string;
  webhookMethod?: 'GET' | 'POST' | 'PUT';
  webhookHeaders?: Record<string, string>;
}

export interface Attachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
}

/**
 * Dead Letter Queue (DLQ) message
 * Messages that failed processing multiple times
 */
export interface DLQMessage {
  originalMessage: NotificationMessage;
  failureReason: string;
  failureTimestamp: number;
  retryCount: number;
  lastError: string;
  topic: string;
  partition: number;
  offset: string;
}

/**
 * Notification event for Event Sourcing
 * Records state changes of notifications
 */
export interface NotificationEvent {
  eventId: string;
  eventType: NotificationEventType;
  notificationId: string;
  timestamp: number;
  payload: Record<string, unknown>;
  correlationId?: string;
}

export enum NotificationEventType {
  NOTIFICATION_CREATED = 'NOTIFICATION_CREATED',
  NOTIFICATION_SCHEDULED = 'NOTIFICATION_SCHEDULED',
  NOTIFICATION_SENT = 'NOTIFICATION_SENT',
  NOTIFICATION_DELIVERED = 'NOTIFICATION_DELIVERED',
  NOTIFICATION_OPENED = 'NOTIFICATION_OPENED',
  NOTIFICATION_CLICKED = 'NOTIFICATION_CLICKED',
  NOTIFICATION_FAILED = 'NOTIFICATION_FAILED',
  NOTIFICATION_RETRY_SCHEDULED = 'NOTIFICATION_RETRY_SCHEDULED',
  NOTIFICATION_CANCELLED = 'NOTIFICATION_CANCELLED',
  NOTIFICATION_EXPIRED = 'NOTIFICATION_EXPIRED',
}

/**
 * Message serialization helper
 */
export class NotificationMessageSerializer {
  /**
   * Serialize notification message to JSON string
   */
  static serialize(message: NotificationMessage): string {
    return JSON.stringify(message);
  }

  /**
   * Deserialize JSON string to notification message
   */
  static deserialize(data: string): NotificationMessage {
    try {
      const message = JSON.parse(data);
      return this.validate(message);
    } catch (error) {
      throw new Error(`Failed to deserialize message: ${error}`);
    }
  }

  /**
   * Validate notification message structure
   */
  static validate(message: unknown): NotificationMessage {
    if (!message || typeof message !== 'object') {
      throw new Error('Invalid message: must be an object');
    }

    const msg = message as NotificationMessage;

    // Required fields
    if (!msg.id) throw new Error('Missing required field: id');
    if (!msg.userId) throw new Error('Missing required field: userId');
    if (!msg.type) throw new Error('Missing required field: type');
    if (!msg.channel) throw new Error('Missing required field: channel');
    if (!msg.priority) throw new Error('Missing required field: priority');
    if (!msg.idempotencyKey)
      throw new Error('Missing required field: idempotencyKey');
    if (!msg.payload) throw new Error('Missing required field: payload');

    // Validate enums
    if (!Object.values(NotificationType).includes(msg.type)) {
      throw new Error(`Invalid notification type: ${msg.type}`);
    }
    if (!Object.values(NotificationChannel).includes(msg.channel)) {
      throw new Error(`Invalid notification channel: ${msg.channel}`);
    }
    if (!Object.values(NotificationPriority).includes(msg.priority)) {
      throw new Error(`Invalid notification priority: ${msg.priority}`);
    }

    return msg;
  }

  /**
   * Create a new notification message with defaults
   */
  static create(
    data: Partial<NotificationMessage> &
      Pick<NotificationMessage, 'userId' | 'type' | 'channel' | 'payload'>,
  ): NotificationMessage {
    return {
      id: data.id || this.generateId(),
      version: data.version || '1.0.0',
      timestamp: data.timestamp || Date.now(),
      idempotencyKey:
        data.idempotencyKey || `${data.userId}-${Date.now()}-${Math.random()}`,
      userId: data.userId,
      tenantId: data.tenantId,
      type: data.type,
      channel: data.channel,
      priority: data.priority || NotificationPriority.MEDIUM,
      status: data.status || NotificationStatus.PENDING,
      scheduledFor: data.scheduledFor,
      expiresAt: data.expiresAt,
      payload: data.payload,
      correlationId: data.correlationId,
      causationId: data.causationId,
      retryCount: data.retryCount || 0,
    };
  }

  /**
   * Generate unique ID
   */
  private static generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
