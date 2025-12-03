import { Injectable, Logger } from '@nestjs/common';
import { PushPayload } from '../fcm.service';

/**
 * MockPushService - Mock push notification service for testing
 *
 * Used when FCM is not configured or ENABLE_MOCK_SERVICES=true
 */
@Injectable()
export class MockPushService {
  private readonly logger = new Logger(MockPushService.name);
  private readonly sentNotifications: Array<{
    payload: PushPayload;
    messageId: string;
    timestamp: Date;
  }> = [];

  /**
   * Mock send push notification - logs and stores in memory
   */
  async sendPush(payload: PushPayload): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    const tokenCount = Array.isArray(payload.token) ? payload.token.length : 1;
    const messageId = `mock-push-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(
      `[MOCK] Sending push notification to ${tokenCount} device(s)`,
    );
    this.logger.debug('[MOCK] Push payload:', {
      title: payload.title,
      body:
        payload.body.substring(0, 50) + (payload.body.length > 50 ? '...' : ''),
      hasData: !!payload.data,
      hasImage: !!payload.image,
      priority: payload.priority,
    });

    // Store in memory
    this.sentNotifications.push({
      payload,
      messageId,
      timestamp: new Date(),
    });

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      success: true,
      messageId: Array.isArray(payload.token)
        ? `${tokenCount}/${tokenCount}`
        : messageId,
    };
  }

  /**
   * Mock send to topic
   */
  async sendToTopic(
    topic: string,
    payload: Omit<PushPayload, 'token'>,
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    const messageId = `mock-topic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(`[MOCK] Sending push notification to topic: ${topic}`);
    this.logger.debug('[MOCK] Topic push payload:', {
      topic,
      title: payload.title,
      body:
        payload.body.substring(0, 50) + (payload.body.length > 50 ? '...' : ''),
    });

    // Store in memory
    this.sentNotifications.push({
      payload: { ...payload, token: `topic:${topic}` },
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
   * Mock subscribe to topic
   */
  async subscribeToTopic(
    tokens: string[],
    topic: string,
  ): Promise<{
    successCount: number;
    failureCount: number;
    errors?: string[];
  }> {
    this.logger.log(
      `[MOCK] Subscribing ${tokens.length} tokens to topic: ${topic}`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      successCount: tokens.length,
      failureCount: 0,
    };
  }

  /**
   * Get sent notifications (for testing/inspection)
   */
  getSentNotifications() {
    return this.sentNotifications;
  }

  /**
   * Clear sent notifications history
   */
  clearHistory() {
    this.sentNotifications.length = 0;
    this.logger.log('[MOCK] Push notification history cleared');
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
