import { Injectable, Logger } from '@nestjs/common';
import { SmsPayload } from '../twilio.service';

/**
 * MockSmsService - Mock SMS service for testing
 *
 * Used when Twilio is not configured or ENABLE_MOCK_SERVICES=true
 */
@Injectable()
export class MockSmsService {
  private readonly logger = new Logger(MockSmsService.name);
  private readonly sentMessages: Array<{
    payload: SmsPayload;
    messageId: string;
    timestamp: Date;
  }> = [];

  /**
   * Mock send SMS - logs and stores in memory
   */
  async sendSms(payload: SmsPayload): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    const messageId = `mock-sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(`[MOCK] Sending SMS to ${payload.to}`);
    this.logger.debug('[MOCK] SMS payload:', {
      to: payload.to,
      body:
        payload.body.substring(0, 50) + (payload.body.length > 50 ? '...' : ''),
      hasMedia: !!payload.mediaUrl,
    });

    // Store in memory
    this.sentMessages.push({
      payload,
      messageId,
      timestamp: new Date(),
    });

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      success: true,
      messageId,
    };
  }

  /**
   * Mock batch send
   */
  async sendBatchSms(
    payloads: SmsPayload[],
  ): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    this.logger.log(`[MOCK] Sending batch of ${payloads.length} SMS messages`);

    const results = await Promise.all(
      payloads.map((payload) => this.sendSms(payload)),
    );

    return results;
  }

  /**
   * Mock validate phone number
   */
  async validatePhoneNumber(phoneNumber: string): Promise<{
    valid: boolean;
    formatted?: string;
    countryCode?: string;
    error?: string;
  }> {
    this.logger.log(`[MOCK] Validating phone number: ${phoneNumber}`);

    // Simple validation - check if it looks like a phone number
    const isValid = /^\+?[1-9]\d{7,14}$/.test(
      phoneNumber.replace(/[\s-]/g, ''),
    );

    return {
      valid: isValid,
      formatted: phoneNumber,
      countryCode: 'US',
    };
  }

  /**
   * Mock get message status
   */
  async getMessageStatus(messageSid: string): Promise<{
    status?: string;
    error?: string;
  }> {
    this.logger.log(`[MOCK] Getting message status: ${messageSid}`);

    const message = this.sentMessages.find((m) => m.messageId === messageSid);

    if (!message) {
      return {
        error: 'Message not found',
      };
    }

    return {
      status: 'delivered',
    };
  }

  /**
   * Get sent messages (for testing/inspection)
   */
  getSentMessages() {
    return this.sentMessages;
  }

  /**
   * Clear sent messages history
   */
  clearHistory() {
    this.sentMessages.length = 0;
    this.logger.log('[MOCK] SMS history cleared');
  }

  /**
   * Verify configuration (always true for mock)
   */
  async verifyConfiguration(): Promise<boolean> {
    return true;
  }

  /**
   * Check if enabled (always true for mock)
   */
  isEnabled(): boolean {
    return true;
  }
}
