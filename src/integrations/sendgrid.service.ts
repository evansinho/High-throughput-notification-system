import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sendgrid from '@sendgrid/mail';

export interface EmailPayload {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
  }>;
}

/**
 * SendGridService - Real email sending via SendGrid
 *
 * Features:
 * - Send transactional emails
 * - Support for HTML and plain text
 * - Template support with dynamic data
 * - Attachment support
 * - Delivery tracking with webhooks
 */
@Injectable()
export class SendGridService {
  private readonly logger = new Logger(SendGridService.name);
  private readonly enabled: boolean;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    this.enabled = !!apiKey;

    if (this.enabled && apiKey) {
      sendgrid.setApiKey(apiKey);
      this.logger.log('SendGrid service initialized');
    } else {
      this.logger.warn(
        'SendGrid API key not configured - email sending disabled',
      );
    }

    this.defaultFrom =
      this.configService.get<string>('SENDGRID_FROM_EMAIL') ||
      'noreply@notification-system.com';
  }

  /**
   * Check if SendGrid is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send an email
   */
  async sendEmail(payload: EmailPayload): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (!this.enabled) {
      this.logger.warn('SendGrid not enabled - skipping email send');
      return {
        success: false,
        error: 'SendGrid not configured',
      };
    }

    try {
      const msg: sendgrid.MailDataRequired = {
        to: payload.to,
        from: payload.from || this.defaultFrom,
        subject: payload.subject,
        ...(payload.html && { html: payload.html }),
        ...(payload.text && { text: payload.text }),
        ...(payload.templateId && {
          templateId: payload.templateId,
          dynamicTemplateData: payload.dynamicTemplateData,
        }),
        ...(payload.attachments && { attachments: payload.attachments }),
      } as sendgrid.MailDataRequired;

      const [response] = await sendgrid.send(msg);

      this.logger.log(
        `Email sent successfully to ${Array.isArray(payload.to) ? payload.to.join(', ') : payload.to} - Status: ${response.statusCode}`,
      );

      return {
        success: true,
        messageId: response.headers['x-message-id'] as string,
      };
    } catch (error) {
      this.logger.error('Failed to send email via SendGrid:', error);

      let errorMessage = 'Unknown error';
      if (error && typeof error === 'object' && 'response' in error) {
        const responseError = error as any;
        errorMessage = `SendGrid API error: ${responseError.response?.body?.errors?.[0]?.message || 'Unknown error'}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send multiple emails in batch
   */
  async sendBatchEmails(
    payloads: EmailPayload[],
  ): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    if (!this.enabled) {
      this.logger.warn('SendGrid not enabled - skipping batch email send');
      return payloads.map(() => ({
        success: false,
        error: 'SendGrid not configured',
      }));
    }

    try {
      const messages = payloads.map(
        (payload) =>
          ({
            to: payload.to,
            from: payload.from || this.defaultFrom,
            subject: payload.subject,
            ...(payload.html && { html: payload.html }),
            ...(payload.text && { text: payload.text }),
            ...(payload.templateId && {
              templateId: payload.templateId,
              dynamicTemplateData: payload.dynamicTemplateData,
            }),
            ...(payload.attachments && { attachments: payload.attachments }),
          }) as sendgrid.MailDataRequired,
      );

      const responses = await sendgrid.send(messages);

      this.logger.log(`Batch email sent: ${payloads.length} emails`);

      // SendGrid returns array of responses for batch
      if (Array.isArray(responses)) {
        return responses.map((response) => ({
          success: true,
          messageId:
            ((response as any).headers?.['x-message-id'] as string) ||
            'unknown',
        }));
      } else {
        // Single response
        return [
          {
            success: true,
            messageId:
              ((responses as any).headers?.['x-message-id'] as string) ||
              'unknown',
          },
        ];
      }
    } catch (error) {
      this.logger.error('Failed to send batch emails via SendGrid:', error);

      let errorMessage = 'Unknown error';
      if (error && typeof error === 'object' && 'response' in error) {
        const responseError = error as any;
        errorMessage = `SendGrid API error: ${responseError.response?.body?.errors?.[0]?.message || 'Unknown error'}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return payloads.map(() => ({
        success: false,
        error: errorMessage,
      }));
    }
  }

  /**
   * Verify SendGrid configuration
   */
  async verifyConfiguration(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      // SendGrid doesn't have a dedicated health check endpoint
      // We'll just verify that the API key is set
      return true;
    } catch (error) {
      this.logger.error('SendGrid configuration verification failed:', error);
      return false;
    }
  }
}
