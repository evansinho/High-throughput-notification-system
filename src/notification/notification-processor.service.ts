import { Injectable, Logger } from '@nestjs/common';
import { NotificationMessage } from '../kafka/schemas/notification.schema';
import { RetryService } from './retry.service';

/**
 * NotificationProcessor - Handles channel-specific notification delivery
 *
 * This service routes notifications to the appropriate channel handler
 * and manages the delivery process with circuit breaker protection.
 *
 * Responsibilities:
 * - Route notifications by channel (EMAIL, SMS, PUSH, WEBHOOK)
 * - Handle channel-specific delivery logic with circuit breakers
 * - Return delivery results (success/failure)
 * - Log delivery attempts
 */
@Injectable()
export class NotificationProcessorService {
  private readonly logger = new Logger(NotificationProcessorService.name);

  constructor(private readonly retryService: RetryService) {}

  /**
   * Process notification based on channel with circuit breaker protection
   */
  async processNotification(notification: NotificationMessage): Promise<void> {
    const { channel, id, userId, correlationId } = notification;

    this.logger.log(
      `Processing ${channel} notification ${id} for user ${userId} (correlationId: ${correlationId})`,
    );

    switch (channel) {
      case 'EMAIL':
        await this.retryService.executeWithCircuitBreaker('sendgrid', () =>
          this.sendEmail(notification),
        );
        break;
      case 'SMS':
        await this.retryService.executeWithCircuitBreaker('twilio', () =>
          this.sendSms(notification),
        );
        break;
      case 'PUSH_IOS':
      case 'PUSH_ANDROID':
        await this.retryService.executeWithCircuitBreaker('fcm', () =>
          this.sendPush(notification),
        );
        break;
      case 'WEBHOOK':
        await this.retryService.executeWithCircuitBreaker('webhook', () =>
          this.sendWebhook(notification),
        );
        break;
      default:
        throw new Error(`Unsupported notification channel: ${channel}`);
    }
  }

  /**
   * Send email notification (mock SendGrid)
   */
  private async sendEmail(notification: NotificationMessage): Promise<void> {
    const { id, payload, correlationId } = notification;
    const startTime = Date.now();

    try {
      // Cast payload to any for channel-specific validation
      const emailPayload = payload as any;

      // Validate email payload
      if (!emailPayload.to || !emailPayload.subject || !emailPayload.body) {
        throw new Error('Invalid email payload: missing to, subject, or body');
      }

      // Mock SendGrid API call
      this.logger.log(`[SENDGRID] Sending email notification ${id}`);
      this.logger.debug(`[SENDGRID] To: ${emailPayload.to}`);
      this.logger.debug(`[SENDGRID] Subject: ${emailPayload.subject}`);
      this.logger.debug(
        `[SENDGRID] From: ${emailPayload.from || 'noreply@example.com'}`,
      );

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Mock successful response
      const latency = Date.now() - startTime;
      this.logger.log(
        `[SENDGRID] Email sent successfully (${latency}ms, messageId: mock-${id}, correlationId: ${correlationId})`,
      );
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `[SENDGRID] Failed to send email (${latency}ms):`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Send SMS notification (mock Twilio)
   */
  private async sendSms(notification: NotificationMessage): Promise<void> {
    const { id, payload, correlationId } = notification;
    const startTime = Date.now();

    try {
      // Cast payload to any for channel-specific validation
      const smsPayload = payload as any;

      // Validate SMS payload
      if (!smsPayload.to || !smsPayload.body) {
        throw new Error('Invalid SMS payload: missing to or body');
      }

      // Mock Twilio API call
      this.logger.log(`[TWILIO] Sending SMS notification ${id}`);
      this.logger.debug(`[TWILIO] To: ${smsPayload.to}`);
      this.logger.debug(`[TWILIO] From: ${smsPayload.from || '+1234567890'}`);
      this.logger.debug(
        `[TWILIO] Body: ${smsPayload.body.substring(0, 50)}...`,
      );

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 75));

      // Mock successful response
      const latency = Date.now() - startTime;
      this.logger.log(
        `[TWILIO] SMS sent successfully (${latency}ms, sid: SM${id.substring(0, 8)}, correlationId: ${correlationId})`,
      );
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `[TWILIO] Failed to send SMS (${latency}ms):`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Send push notification (mock Firebase Cloud Messaging)
   */
  private async sendPush(notification: NotificationMessage): Promise<void> {
    const { id, payload, correlationId } = notification;
    const startTime = Date.now();

    try {
      // Cast payload to any for channel-specific validation
      const pushPayload = payload as any;

      // Validate push payload
      if (!pushPayload.token && !pushPayload.topic) {
        throw new Error('Invalid push payload: missing token or topic');
      }

      if (!pushPayload.title || !pushPayload.body) {
        throw new Error('Invalid push payload: missing title or body');
      }

      // Mock FCM API call
      this.logger.log(`[FCM] Sending push notification ${id}`);
      this.logger.debug(
        `[FCM] Target: ${pushPayload.token ? 'token' : 'topic'}`,
      );
      this.logger.debug(`[FCM] Title: ${pushPayload.title}`);
      this.logger.debug(`[FCM] Body: ${pushPayload.body.substring(0, 50)}...`);

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Mock successful response
      const latency = Date.now() - startTime;
      this.logger.log(
        `[FCM] Push notification sent successfully (${latency}ms, messageId: fcm-${id.substring(0, 8)}, correlationId: ${correlationId})`,
      );
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `[FCM] Failed to send push notification (${latency}ms):`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Send webhook notification (HTTP POST)
   */
  private async sendWebhook(notification: NotificationMessage): Promise<void> {
    const { id, payload, correlationId } = notification;
    const startTime = Date.now();

    try {
      // Cast payload to any for channel-specific validation
      const webhookPayload = payload as any;

      // Validate webhook payload
      if (!webhookPayload.url) {
        throw new Error('Invalid webhook payload: missing url');
      }

      if (!webhookPayload.method) {
        webhookPayload.method = 'POST';
      }

      // Mock HTTP client call
      this.logger.log(`[WEBHOOK] Sending webhook notification ${id}`);
      this.logger.debug(`[WEBHOOK] URL: ${webhookPayload.url}`);
      this.logger.debug(`[WEBHOOK] Method: ${webhookPayload.method}`);
      this.logger.debug(
        `[WEBHOOK] Headers: ${JSON.stringify(webhookPayload.headers || {})}`,
      );

      // Simulate HTTP call delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Mock successful response
      const latency = Date.now() - startTime;
      this.logger.log(
        `[WEBHOOK] Webhook delivered successfully (${latency}ms, status: 200, correlationId: ${correlationId})`,
      );
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `[WEBHOOK] Failed to send webhook (${latency}ms):`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
