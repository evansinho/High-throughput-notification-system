import { Injectable, Logger } from '@nestjs/common';
import { EmailPayload } from '../sendgrid.service';

/**
 * MockEmailService - Mock email service for testing
 *
 * Used when SendGrid is not configured or ENABLE_MOCK_SERVICES=true
 */
@Injectable()
export class MockEmailService {
  private readonly logger = new Logger(MockEmailService.name);
  private readonly sentEmails: Array<{
    payload: EmailPayload;
    messageId: string;
    timestamp: Date;
  }> = [];

  /**
   * Mock send email - logs and stores in memory
   */
  async sendEmail(payload: EmailPayload): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    const messageId = `mock-email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(
      `[MOCK] Sending email to ${Array.isArray(payload.to) ? payload.to.join(', ') : payload.to}`,
    );
    this.logger.debug('[MOCK] Email payload:', {
      to: payload.to,
      subject: payload.subject,
      hasHtml: !!payload.html,
      hasText: !!payload.text,
      templateId: payload.templateId,
    });

    // Store in memory for inspection
    this.sentEmails.push({
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
  async sendBatchEmails(
    payloads: EmailPayload[],
  ): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    this.logger.log(`[MOCK] Sending batch of ${payloads.length} emails`);

    const results = await Promise.all(
      payloads.map((payload) => this.sendEmail(payload)),
    );

    return results;
  }

  /**
   * Get sent emails (for testing/inspection)
   */
  getSentEmails() {
    return this.sentEmails;
  }

  /**
   * Clear sent emails history
   */
  clearHistory() {
    this.sentEmails.length = 0;
    this.logger.log('[MOCK] Email history cleared');
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
