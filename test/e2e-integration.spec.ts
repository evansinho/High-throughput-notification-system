import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as request from 'supertest';

describe('E2E Integration Test: API → Kafka → Worker → DB', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Register a test user and get auth token
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'e2e-test@example.com',
        password: 'Test123!@#',
        name: 'E2E Test User',
      });

    authToken = registerResponse.body.access_token;

    // Get user ID
    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    userId = meResponse.body.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.notification.deleteMany({
      where: { userId },
    });
    await prisma.user.deleteMany({
      where: { email: 'e2e-test@example.com' },
    });

    await app.close();
  });

  describe('Full Notification Flow', () => {
    it('should create notification → publish to Kafka → process via worker → update DB', async () => {
      // Step 1: Create notification via API
      const createResponse = await request(app.getHttpServer())
        .post('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId,
          tenantId: 'test-tenant',
          type: 'TRANSACTIONAL',
          channel: 'EMAIL',
          priority: 'HIGH',
          payload: {
            to: 'e2e-test@example.com',
            subject: 'E2E Test Notification',
            body: 'This is an end-to-end integration test',
            from: 'noreply@example.com',
          },
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toHaveProperty('id');
      expect(createResponse.body.status).toBe('PENDING');

      const notificationId = createResponse.body.id;

      // Step 2: Wait for Kafka consumer to process (max 10 seconds)
      let attempts = 0;
      let notification;
      const maxAttempts = 50; // 10 seconds (50 * 200ms)

      while (attempts < maxAttempts) {
        notification = await prisma.notification.findUnique({
          where: { id: notificationId },
        });

        if (notification?.status === 'SENT' && notification?.sentAt) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
        attempts++;
      }

      // Step 3: Verify notification was processed
      expect(notification).toBeDefined();
      expect(notification?.status).toBe('SENT');
      expect(notification?.sentAt).toBeDefined();
      expect(notification?.sentAt).toBeInstanceOf(Date);
      expect(notification?.updatedAt).toBeDefined();

      // Step 4: Verify via API
      const getResponse = await request(app.getHttpServer())
        .get(`/notifications/${notificationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.status).toBe('SENT');
      expect(getResponse.body.sentAt).toBeDefined();

      console.log(
        `✅ E2E Test passed: Notification ${notificationId} processed in ${attempts * 200}ms`,
      );
    }, 15000); // 15 second timeout

    it('should handle multiple notifications concurrently', async () => {
      const notificationPromises = [];

      // Create 5 notifications concurrently
      for (let i = 0; i < 5; i++) {
        const promise = request(app.getHttpServer())
          .post('/notifications')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId,
            tenantId: 'test-tenant',
            type: 'TRANSACTIONAL',
            channel: 'EMAIL',
            priority: 'MEDIUM',
            payload: {
              to: `test${i}@example.com`,
              subject: `Concurrent Test ${i}`,
              body: `Testing concurrent processing ${i}`,
            },
          });

        notificationPromises.push(promise);
      }

      const responses = await Promise.all(notificationPromises);

      // Verify all created successfully
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.status).toBe('PENDING');
      });

      const notificationIds = responses.map((r) => r.body.id);

      // Wait for all to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify all were processed
      const notifications = await prisma.notification.findMany({
        where: {
          id: { in: notificationIds },
        },
      });

      const sentCount = notifications.filter((n) => n.status === 'SENT').length;
      expect(sentCount).toBeGreaterThanOrEqual(4); // Allow for timing variations

      console.log(
        `✅ Concurrent test passed: ${sentCount}/5 notifications processed`,
      );
    }, 20000);
  });

  describe('Health Endpoints', () => {
    it('should return healthy status from /health', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('should return worker metrics from /health/worker', async () => {
      const response = await request(app.getHttpServer()).get('/health/worker');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('worker');
      expect(response.body.worker).toHaveProperty('processedCount');
      expect(response.body.worker).toHaveProperty('errorCount');
      expect(response.body.worker).toHaveProperty('performance');
      expect(response.body.worker.performance).toHaveProperty('throughput');
      expect(response.body.worker.performance).toHaveProperty(
        'avgProcessingTime',
      );
      expect(response.body.worker).toHaveProperty('consumerLag');
      expect(response.body.worker.consumerLag).toHaveProperty('totalLag');
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid notification payloads', async () => {
      const response = await request(app.getHttpServer())
        .post('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId,
          type: 'TRANSACTIONAL',
          channel: 'EMAIL',
          // Missing required fields: tenantId, priority, payload
        });

      expect(response.status).toBe(400);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app.getHttpServer())
        .post('/notifications')
        .send({
          userId,
          tenantId: 'test',
          type: 'TRANSACTIONAL',
          channel: 'EMAIL',
          priority: 'MEDIUM',
          payload: {
            to: 'test@example.com',
            subject: 'Test',
            body: 'Test',
          },
        });

      expect(response.status).toBe(401);
    });
  });
});
