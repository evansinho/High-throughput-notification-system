import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendGridService } from './sendgrid.service';
import { TwilioService } from './twilio.service';
import { FCMService } from './fcm.service';
import { MockEmailService } from './mock/mock-email.service';
import { MockSmsService } from './mock/mock-sms.service';
import { MockPushService } from './mock/mock-push.service';
import { WebhooksController } from './webhooks.controller';
import { PrismaModule } from '../prisma/prisma.module';

// Provider tokens
export const EMAIL_SERVICE = 'EMAIL_SERVICE';
export const SMS_SERVICE = 'SMS_SERVICE';
export const PUSH_SERVICE = 'PUSH_SERVICE';

/**
 * IntegrationsModule - External service integrations
 *
 * Provides real or mock services based on configuration:
 * - If ENABLE_MOCK_SERVICES=true, use mocks
 * - If real service credentials not configured, use mocks
 * - Otherwise, use real services
 */
@Module({
  imports: [PrismaModule],
  controllers: [WebhooksController],
  providers: [
    // Real services
    SendGridService,
    TwilioService,
    FCMService,

    // Mock services
    MockEmailService,
    MockSmsService,
    MockPushService,

    // Email Service Provider
    {
      provide: EMAIL_SERVICE,
      useFactory: (
        sendGridService: SendGridService,
        mockEmailService: MockEmailService,
        configService: ConfigService,
      ) => {
        const useMocks =
          configService.get<string>('ENABLE_MOCK_SERVICES') === 'true';

        if (useMocks) {
          return mockEmailService;
        }

        // Use real service if configured, otherwise fallback to mock
        return sendGridService.isEnabled() ? sendGridService : mockEmailService;
      },
      inject: [SendGridService, MockEmailService, ConfigService],
    },

    // SMS Service Provider
    {
      provide: SMS_SERVICE,
      useFactory: (
        twilioService: TwilioService,
        mockSmsService: MockSmsService,
        configService: ConfigService,
      ) => {
        const useMocks =
          configService.get<string>('ENABLE_MOCK_SERVICES') === 'true';

        if (useMocks) {
          return mockSmsService;
        }

        // Use real service if configured, otherwise fallback to mock
        return twilioService.isEnabled() ? twilioService : mockSmsService;
      },
      inject: [TwilioService, MockSmsService, ConfigService],
    },

    // Push Service Provider
    {
      provide: PUSH_SERVICE,
      useFactory: (
        fcmService: FCMService,
        mockPushService: MockPushService,
        configService: ConfigService,
      ) => {
        const useMocks =
          configService.get<string>('ENABLE_MOCK_SERVICES') === 'true';

        if (useMocks) {
          return mockPushService;
        }

        // Use real service if configured, otherwise fallback to mock
        return fcmService.isEnabled() ? fcmService : mockPushService;
      },
      inject: [FCMService, MockPushService, ConfigService],
    },
  ],
  exports: [
    EMAIL_SERVICE,
    SMS_SERVICE,
    PUSH_SERVICE,
    SendGridService,
    TwilioService,
    FCMService,
    MockEmailService,
    MockSmsService,
    MockPushService,
  ],
})
export class IntegrationsModule {}
