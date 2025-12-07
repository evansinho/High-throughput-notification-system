import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * WebhooksController - Handle delivery status callbacks from external services
 *
 * Endpoints:
 * - POST /webhooks/sendgrid - SendGrid event webhook
 * - POST /webhooks/twilio - Twilio status callback
 * - POST /webhooks/fcm - FCM delivery receipt (if needed)
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * SendGrid Event Webhook
   * Handles delivery events: delivered, bounce, dropped, spam, etc.
   */
  @Post('sendgrid')
  @HttpCode(HttpStatus.OK)
  async handleSendGridWebhook(@Body() events: any[]) {
    this.logger.log(`Received SendGrid webhook with ${events.length} events`);

    try {
      for (const event of events) {
        const { sg_message_id, event: eventType, timestamp } = event;

        if (!sg_message_id) {
          continue;
        }

        // Find notification by message ID stored in metadata
        const notification = await this.prisma.notification.findFirst({
          where: {
            metadata: {
              path: ['messageId'],
              equals: sg_message_id,
            },
          },
        });

        if (!notification) {
          this.logger.warn(
            `Notification not found for SendGrid message ID: ${sg_message_id}`,
          );
          continue;
        }

        // Update notification based on event type
        switch (eventType) {
          case 'delivered':
            await this.prisma.notification.update({
              where: { id: notification.id },
              data: {
                status: 'SENT',
                deliveredAt: new Date(timestamp * 1000),
              },
            });
            this.logger.log(`Email delivered: ${notification.id}`);
            break;

          case 'bounce':
          case 'dropped':
          case 'deferred':
            await this.prisma.notification.update({
              where: { id: notification.id },
              data: {
                status: 'FAILED',
                failedAt: new Date(),
                errorMessage: `SendGrid event: ${eventType} - ${event.reason || 'Unknown reason'}`,
              },
            });
            this.logger.warn(`Email failed: ${notification.id} - ${eventType}`);
            break;

          case 'open':
          case 'click':
            // Track engagement metrics (optional)
            this.logger.log(
              `Email engagement: ${notification.id} - ${eventType}`,
            );
            break;

          default:
            this.logger.debug(`Unhandled SendGrid event: ${eventType}`);
        }
      }

      return { success: true, processed: events.length };
    } catch (error) {
      this.logger.error('Error processing SendGrid webhook:', error);
      // Return 200 to prevent retries for processing errors
      return { success: false, error: 'Processing error' };
    }
  }

  /**
   * Twilio Status Callback
   * Handles SMS delivery status updates
   */
  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  async handleTwilioWebhook(@Body() body: any) {
    // Note: Signature validation should be implemented in production
    // using @Headers('x-twilio-signature') for security
    this.logger.log(`Received Twilio webhook - SID: ${body.MessageSid}`);

    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = body;

      if (!MessageSid) {
        this.logger.warn('Twilio webhook missing MessageSid');
        return { success: false, error: 'Missing MessageSid' };
      }

      // Find notification by Twilio message SID
      const notification = await this.prisma.notification.findFirst({
        where: {
          metadata: {
            path: ['messageId'],
            equals: MessageSid,
          },
        },
      });

      if (!notification) {
        this.logger.warn(
          `Notification not found for Twilio SID: ${MessageSid}`,
        );
        return { success: false, error: 'Notification not found' };
      }

      // Update notification based on status
      switch (MessageStatus) {
        case 'delivered':
          await this.prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: 'SENT',
              deliveredAt: new Date(),
            },
          });
          this.logger.log(`SMS delivered: ${notification.id}`);
          break;

        case 'sent':
          await this.prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
            },
          });
          this.logger.log(`SMS sent: ${notification.id}`);
          break;

        case 'failed':
        case 'undelivered':
          await this.prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              errorMessage: ErrorMessage || `Twilio error: ${ErrorCode}`,
            },
          });
          this.logger.warn(`SMS failed: ${notification.id} - ${MessageStatus}`);
          break;

        default:
          this.logger.debug(`Twilio status: ${MessageStatus}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Error processing Twilio webhook:', error);
      return { success: false, error: 'Processing error' };
    }
  }

  /**
   * FCM Delivery Receipt (optional)
   * FCM doesn't have direct webhooks, but you can implement custom tracking
   */
  @Post('fcm')
  @HttpCode(HttpStatus.OK)
  async handleFCMWebhook(@Body() body: any) {
    this.logger.log('Received FCM webhook');

    try {
      const { messageId, status, error } = body;

      if (!messageId) {
        return { success: false, error: 'Missing messageId' };
      }

      const notification = await this.prisma.notification.findFirst({
        where: {
          metadata: {
            path: ['messageId'],
            equals: messageId,
          },
        },
      });

      if (!notification) {
        this.logger.warn(
          `Notification not found for FCM message ID: ${messageId}`,
        );
        return { success: false, error: 'Notification not found' };
      }

      if (status === 'delivered') {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'SENT',
            deliveredAt: new Date(),
          },
        });
      } else if (status === 'failed') {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            errorMessage: error || 'FCM delivery failed',
          },
        });
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Error processing FCM webhook:', error);
      return { success: false, error: 'Processing error' };
    }
  }

  /**
   * Generic webhook endpoint for testing
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async handleTestWebhook(@Body() body: any, @Headers() headers: any) {
    this.logger.log('Received test webhook');
    this.logger.debug('Headers:', headers);
    this.logger.debug('Body:', JSON.stringify(body));

    return {
      success: true,
      received: {
        timestamp: new Date().toISOString(),
        body,
      },
    };
  }
}
