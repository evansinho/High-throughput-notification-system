import { Test, TestingModule } from '@nestjs/testing';
import { KafkaProducerService } from './kafka-producer.service';
import { NotificationMessage } from './schemas/notification.schema';
import {
  NotificationChannel,
  NotificationType,
  NotificationPriority,
} from '@prisma/client';

// Mock kafkajs
jest.mock('kafkajs', () => {
  const mockProducer = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue([
      {
        topicName: 'notifications',
        partition: 0,
        baseOffset: '100',
        errorCode: 0,
      },
    ]),
    transaction: jest.fn(),
  };

  const mockKafka = {
    producer: jest.fn(() => mockProducer),
  };

  return {
    Kafka: jest.fn(() => mockKafka),
    CompressionTypes: {
      GZIP: 1,
      Snappy: 2,
      LZ4: 3,
      ZSTD: 4,
    },
  };
});

describe('KafkaProducerService', () => {
  let service: KafkaProducerService;
  let mockProducer: any;

  beforeEach(async () => {
    // Clear module cache to reset mocks
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [KafkaProducerService],
    }).compile();

    service = module.get<KafkaProducerService>(KafkaProducerService);
    mockProducer = (service as any).producer;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect producer on module init', async () => {
      await service.onModuleInit();

      expect(mockProducer.connect).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect producer on module destroy', async () => {
      await service.onModuleDestroy();

      expect(mockProducer.disconnect).toHaveBeenCalled();
    });
  });

  describe('sendNotification', () => {
    const mockMessage: NotificationMessage = {
      id: 'notif-123',
      userId: 'user-456',
      tenantId: 'tenant-789',
      channel: NotificationChannel.EMAIL,
      type: NotificationType.TRANSACTIONAL,
      priority: NotificationPriority.HIGH,
      payload: {
        to: 'user@example.com',
        subject: 'Test Notification',
        body: 'This is a test',
      },
      idempotencyKey: 'idem-123',
      correlationId: 'corr-456',
    };

    it('should send a notification message successfully', async () => {
      const result = await service.sendNotification(mockMessage);

      expect(result).toBeDefined();
      expect(result[0].topicName).toBe('notifications');
      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'notifications',
          compression: 1, // GZIP
          messages: expect.arrayContaining([
            expect.objectContaining({
              key: mockMessage.userId,
              value: JSON.stringify(mockMessage),
              headers: expect.objectContaining({
                'idempotency-key': mockMessage.idempotencyKey,
                'message-type': mockMessage.type,
                priority: mockMessage.priority,
              }),
            }),
          ]),
        }),
      );
    });

    it('should throw error if send fails', async () => {
      const error = new Error('Kafka send failed');
      mockProducer.send.mockRejectedValueOnce(error);

      await expect(service.sendNotification(mockMessage)).rejects.toThrow(
        'Kafka send failed',
      );
    });

    it('should use userId as partition key', async () => {
      await service.sendNotification(mockMessage);

      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              key: 'user-456',
            }),
          ]),
        }),
      );
    });

    it('should include all required headers', async () => {
      await service.sendNotification(mockMessage);

      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              headers: {
                'idempotency-key': 'idem-123',
                'message-type': NotificationType.TRANSACTIONAL,
                priority: NotificationPriority.HIGH,
              },
            }),
          ]),
        }),
      );
    });
  });

  describe('sendNotificationBatch', () => {
    const mockMessages: NotificationMessage[] = [
      {
        id: 'notif-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        channel: NotificationChannel.EMAIL,
        type: NotificationType.TRANSACTIONAL,
        priority: NotificationPriority.HIGH,
        payload: { to: 'user1@example.com', subject: 'Test 1', body: 'Body 1' },
        idempotencyKey: 'idem-1',
        correlationId: 'corr-1',
      },
      {
        id: 'notif-2',
        userId: 'user-2',
        tenantId: 'tenant-2',
        channel: NotificationChannel.SMS,
        type: NotificationType.MARKETING,
        priority: NotificationPriority.MEDIUM,
        payload: { to: '+1234567890', body: 'SMS body' },
        idempotencyKey: 'idem-2',
        correlationId: 'corr-2',
      },
    ];

    it('should send multiple notifications in batch', async () => {
      const result = await service.sendNotificationBatch(mockMessages);

      expect(result).toBeDefined();
      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'notifications',
          compression: 1, // GZIP
          messages: expect.arrayContaining([
            expect.objectContaining({
              key: 'user-1',
              value: JSON.stringify(mockMessages[0]),
            }),
            expect.objectContaining({
              key: 'user-2',
              value: JSON.stringify(mockMessages[1]),
            }),
          ]),
        }),
      );
    });

    it('should handle batch send failure', async () => {
      const error = new Error('Batch send failed');
      mockProducer.send.mockRejectedValueOnce(error);

      await expect(
        service.sendNotificationBatch(mockMessages),
      ).rejects.toThrow('Batch send failed');
    });

    it('should send empty batch without error', async () => {
      const result = await service.sendNotificationBatch([]);

      expect(result).toBeDefined();
      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [],
        }),
      );
    });
  });

  describe('sendToTopic', () => {
    it('should send message to custom topic', async () => {
      const topic = 'custom-topic';
      const key = 'custom-key';
      const value = { data: 'test' };
      const headers = { 'custom-header': 'value' };

      const result = await service.sendToTopic(topic, key, value, headers);

      expect(result).toBeDefined();
      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'custom-topic',
          messages: expect.arrayContaining([
            expect.objectContaining({
              key: 'custom-key',
              value: JSON.stringify(value),
              headers: { 'custom-header': 'value' },
            }),
          ]),
        }),
      );
    });

    it('should handle custom topic send failure', async () => {
      const error = new Error('Custom topic send failed');
      mockProducer.send.mockRejectedValueOnce(error);

      await expect(
        service.sendToTopic('topic', 'key', { data: 'test' }),
      ).rejects.toThrow('Custom topic send failed');
    });
  });

  describe('sendInTransaction', () => {
    const mockTransaction = {
      send: jest.fn().mockResolvedValue([
        {
          topicName: 'notifications',
          partition: 0,
          baseOffset: '100',
        },
      ]),
      commit: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      mockProducer.transaction.mockReturnValue(mockTransaction);
    });

    it('should send messages in transaction and commit', async () => {
      const records = [
        {
          topic: 'notifications',
          messages: [
            {
              key: 'user-1',
              value: JSON.stringify({ data: 'test1' }),
            },
          ],
        },
        {
          topic: 'notifications',
          messages: [
            {
              key: 'user-2',
              value: JSON.stringify({ data: 'test2' }),
            },
          ],
        },
      ];

      const result = await service.sendInTransaction(records);

      expect(result).toHaveLength(2);
      expect(mockProducer.transaction).toHaveBeenCalled();
      expect(mockTransaction.send).toHaveBeenCalledTimes(2);
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockTransaction.abort).not.toHaveBeenCalled();
    });

    it('should abort transaction on error', async () => {
      const records = [
        {
          topic: 'notifications',
          messages: [
            {
              key: 'user-1',
              value: JSON.stringify({ data: 'test' }),
            },
          ],
        },
      ];

      const error = new Error('Transaction failed');
      mockTransaction.send.mockRejectedValueOnce(error);

      await expect(service.sendInTransaction(records)).rejects.toThrow(
        'Transaction failed',
      );
      expect(mockTransaction.abort).toHaveBeenCalled();
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });
  });
});
