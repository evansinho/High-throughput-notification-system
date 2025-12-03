import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface PushPayload {
  token: string | string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  image?: string;
  badge?: number;
  sound?: string;
  clickAction?: string;
  priority?: 'high' | 'normal';
}

/**
 * FCMService - Real push notifications via Firebase Cloud Messaging
 *
 * Features:
 * - Send push notifications to iOS and Android
 * - Support for data payloads
 * - Topic-based messaging
 * - Batch sending
 * - Token validation
 */
@Injectable()
export class FCMService {
  private readonly logger = new Logger(FCMService.name);
  private readonly enabled: boolean;
  private app: admin.app.App | null = null;

  constructor(private readonly configService: ConfigService) {
    const serviceAccount = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_PATH',
    );
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');

    this.enabled = !!(serviceAccount || projectId);

    if (this.enabled) {
      try {
        // Initialize with service account file if provided
        if (serviceAccount) {
          this.app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
        }
        // Or initialize with default credentials (for Google Cloud environments)
        else if (projectId) {
          this.app = admin.initializeApp({
            projectId,
          });
        }

        this.logger.log('Firebase Cloud Messaging service initialized');
      } catch (error) {
        this.logger.error('Failed to initialize FCM:', error);
        this.enabled = false;
      }
    } else {
      this.logger.warn(
        'Firebase credentials not configured - push notifications disabled',
      );
    }
  }

  /**
   * Check if FCM is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.app !== null;
  }

  /**
   * Send a push notification
   */
  async sendPush(payload: PushPayload): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (!this.enabled || !this.app) {
      this.logger.warn('FCM not enabled - skipping push notification');
      return {
        success: false,
        error: 'FCM not configured',
      };
    }

    try {
      const messaging = admin.messaging(this.app);

      // Single token
      if (typeof payload.token === 'string') {
        const message: admin.messaging.Message = {
          token: payload.token,
          notification: {
            title: payload.title,
            body: payload.body,
            ...(payload.image && { imageUrl: payload.image }),
          },
          ...(payload.data && { data: payload.data }),
          android: {
            priority: payload.priority || 'high',
            notification: {
              ...(payload.sound && { sound: payload.sound }),
              ...(payload.clickAction && { clickAction: payload.clickAction }),
            },
          },
          apns: {
            payload: {
              aps: {
                ...(payload.badge !== undefined && { badge: payload.badge }),
                ...(payload.sound && { sound: payload.sound }),
              },
            },
          },
        };

        const response = await messaging.send(message);

        this.logger.log(
          `Push notification sent successfully - Message ID: ${response}`,
        );

        return {
          success: true,
          messageId: response,
        };
      }
      // Multiple tokens (multicast)
      else {
        const message: admin.messaging.MulticastMessage = {
          tokens: payload.token,
          notification: {
            title: payload.title,
            body: payload.body,
            ...(payload.image && { imageUrl: payload.image }),
          },
          ...(payload.data && { data: payload.data }),
          android: {
            priority: payload.priority || 'high',
            notification: {
              ...(payload.sound && { sound: payload.sound }),
              ...(payload.clickAction && { clickAction: payload.clickAction }),
            },
          },
          apns: {
            payload: {
              aps: {
                ...(payload.badge !== undefined && { badge: payload.badge }),
                ...(payload.sound && { sound: payload.sound }),
              },
            },
          },
        };

        const response = await messaging.sendEachForMulticast(message);

        this.logger.log(
          `Push notifications sent: ${response.successCount}/${payload.token.length} succeeded`,
        );

        return {
          success: response.successCount > 0,
          messageId: `${response.successCount}/${payload.token.length}`,
        };
      }
    } catch (error) {
      this.logger.error('Failed to send push notification via FCM:', error);

      let errorMessage = 'Unknown error';
      if (error && typeof error === 'object' && 'code' in error) {
        const fcmError = error as any;
        errorMessage = `FCM error ${fcmError.code}: ${fcmError.message}`;
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
   * Send push notification to a topic
   */
  async sendToTopic(
    topic: string,
    payload: Omit<PushPayload, 'token'>,
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (!this.enabled || !this.app) {
      this.logger.warn('FCM not enabled - skipping topic push notification');
      return {
        success: false,
        error: 'FCM not configured',
      };
    }

    try {
      const messaging = admin.messaging(this.app);

      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.image && { imageUrl: payload.image }),
        },
        ...(payload.data && { data: payload.data }),
        android: {
          priority: payload.priority || 'high',
          notification: {
            ...(payload.sound && { sound: payload.sound }),
            ...(payload.clickAction && { clickAction: payload.clickAction }),
          },
        },
        apns: {
          payload: {
            aps: {
              ...(payload.badge !== undefined && { badge: payload.badge }),
              ...(payload.sound && { sound: payload.sound }),
            },
          },
        },
      };

      const response = await messaging.send(message);

      this.logger.log(
        `Push notification sent to topic "${topic}" - Message ID: ${response}`,
      );

      return {
        success: true,
        messageId: response,
      };
    } catch (error) {
      this.logger.error('Failed to send topic push notification:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Subscribe tokens to a topic
   */
  async subscribeToTopic(
    tokens: string[],
    topic: string,
  ): Promise<{
    successCount: number;
    failureCount: number;
    errors?: string[];
  }> {
    if (!this.enabled || !this.app) {
      return {
        successCount: 0,
        failureCount: tokens.length,
        errors: ['FCM not configured'],
      };
    }

    try {
      const messaging = admin.messaging(this.app);
      const response = await messaging.subscribeToTopic(tokens, topic);

      this.logger.log(
        `Subscribed ${response.successCount}/${tokens.length} tokens to topic "${topic}"`,
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        errors: response.errors?.map((err) => err.error.message),
      };
    } catch (error) {
      this.logger.error('Failed to subscribe tokens to topic:', error);

      return {
        successCount: 0,
        failureCount: tokens.length,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Verify FCM configuration
   */
  async verifyConfiguration(): Promise<boolean> {
    if (!this.enabled || !this.app) {
      return false;
    }

    try {
      // Try to access the messaging service to verify setup
      admin.messaging(this.app);
      return true;
    } catch (error) {
      this.logger.error('FCM configuration verification failed:', error);
      return false;
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    if (this.app) {
      try {
        await this.app.delete();
        this.logger.log('Firebase app instance deleted');
      } catch (error) {
        this.logger.error('Failed to delete Firebase app:', error);
      }
    }
  }
}
