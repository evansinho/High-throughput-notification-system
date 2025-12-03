import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

export interface SmsPayload {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
  statusCallback?: string;
}

/**
 * TwilioService - Real SMS sending via Twilio
 *
 * Features:
 * - Send SMS messages
 * - Support for MMS (media messages)
 * - Delivery status tracking
 * - Phone number validation
 */
@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly client: Twilio | null = null;
  private readonly enabled: boolean;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.defaultFrom =
      this.configService.get<string>('TWILIO_PHONE_NUMBER') || '';

    this.enabled = !!(accountSid && authToken && this.defaultFrom);

    if (this.enabled && accountSid && authToken) {
      this.client = new Twilio(accountSid, authToken);
      this.logger.log('Twilio service initialized');
    } else {
      this.logger.warn(
        'Twilio credentials not configured - SMS sending disabled',
      );
    }
  }

  /**
   * Check if Twilio is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send an SMS
   */
  async sendSms(payload: SmsPayload): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (!this.enabled || !this.client) {
      this.logger.warn('Twilio not enabled - skipping SMS send');
      return {
        success: false,
        error: 'Twilio not configured',
      };
    }

    try {
      const message = await this.client.messages.create({
        to: payload.to,
        from: payload.from || this.defaultFrom,
        body: payload.body,
        ...(payload.mediaUrl && { mediaUrl: payload.mediaUrl }),
        ...(payload.statusCallback && {
          statusCallback: payload.statusCallback,
        }),
      });

      this.logger.log(
        `SMS sent successfully to ${payload.to} - SID: ${message.sid}`,
      );

      return {
        success: true,
        messageId: message.sid,
      };
    } catch (error) {
      this.logger.error('Failed to send SMS via Twilio:', error);

      let errorMessage = 'Unknown error';
      if (error && typeof error === 'object' && 'code' in error) {
        const twilioError = error as any;
        errorMessage = `Twilio error ${twilioError.code}: ${twilioError.message}`;
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
   * Send multiple SMS messages
   */
  async sendBatchSms(
    payloads: SmsPayload[],
  ): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    if (!this.enabled || !this.client) {
      this.logger.warn('Twilio not enabled - skipping batch SMS send');
      return payloads.map(() => ({
        success: false,
        error: 'Twilio not configured',
      }));
    }

    const results = await Promise.allSettled(
      payloads.map((payload) => this.sendSms(payload)),
    );

    return results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : 'Unknown error',
        };
      }
    });
  }

  /**
   * Validate a phone number
   */
  async validatePhoneNumber(phoneNumber: string): Promise<{
    valid: boolean;
    formatted?: string;
    countryCode?: string;
    error?: string;
  }> {
    if (!this.enabled || !this.client) {
      return {
        valid: false,
        error: 'Twilio not configured',
      };
    }

    try {
      const lookupResult = await this.client.lookups.v2
        .phoneNumbers(phoneNumber)
        .fetch();

      return {
        valid: lookupResult.valid || false,
        formatted: lookupResult.phoneNumber,
        countryCode: lookupResult.countryCode,
      };
    } catch (error) {
      this.logger.error('Failed to validate phone number:', error);

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageSid: string): Promise<{
    status?: string;
    error?: string;
  }> {
    if (!this.enabled || !this.client) {
      return {
        error: 'Twilio not configured',
      };
    }

    try {
      const message = await this.client.messages(messageSid).fetch();

      return {
        status: message.status,
      };
    } catch (error) {
      this.logger.error('Failed to fetch message status:', error);

      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify Twilio configuration
   */
  async verifyConfiguration(): Promise<boolean> {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      // Verify account by fetching account details
      await this.client.api.accounts.list({ limit: 1 });
      return true;
    } catch (error) {
      this.logger.error('Twilio configuration verification failed:', error);
      return false;
    }
  }
}
