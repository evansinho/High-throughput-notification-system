import { Test, TestingModule } from '@nestjs/testing';
import { TemplateExtractorService } from './template-extractor.service';
import { RawNotificationData } from '../../interfaces/template-document.interface';

describe('TemplateExtractorService', () => {
  let service: TemplateExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateExtractorService],
    }).compile();

    service = module.get<TemplateExtractorService>(TemplateExtractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractTemplate', () => {
    it('should extract template from email notification with payload.body', () => {
      const rawData: RawNotificationData = {
        id: 'test-1',
        userId: 'user-1',
        channel: 'email',
        type: 'TRANSACTIONAL',
        subject: 'Welcome to our platform',
        payload: {
          body: 'Hello {{user_name}}, welcome to our platform!',
        },
        status: 'SENT',
        priority: 'MEDIUM',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const template = service.extractTemplate(rawData);

      expect(template).toBeDefined();
      expect(template?.content).toBe(
        'Hello {{user_name}}, welcome to our platform!',
      );
      expect(template?.metadata.channel).toBe('email');
      expect(template?.metadata.type).toBe('TRANSACTIONAL');
      expect(template?.metadata.subject).toBe('Welcome to our platform');
      expect(template?.metadata.hasPersonalization).toBe(true);
      expect(template?.metadata.variables).toEqual(['user_name']);
    });

    it('should extract template from SMS notification', () => {
      const rawData: RawNotificationData = {
        id: 'test-2',
        userId: 'user-1',
        channel: 'sms',
        type: 'TRANSACTIONAL',
        payload: {
          message: 'Your code is {{code}}',
        },
        status: 'SENT',
        priority: 'HIGH',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const template = service.extractTemplate(rawData);

      expect(template).toBeDefined();
      expect(template?.content).toBe('Your code is {{code}}');
      expect(template?.metadata.channel).toBe('sms');
      expect(template?.metadata.hasPersonalization).toBe(true);
      expect(template?.metadata.variables).toEqual(['code']);
    });

    it('should extract template from push notification', () => {
      const rawData: RawNotificationData = {
        id: 'test-3',
        userId: 'user-1',
        channel: 'push',
        type: 'MARKETING',
        payload: {
          alert: 'New message from ${sender_name}',
        },
        status: 'SENT',
        priority: 'MEDIUM',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const template = service.extractTemplate(rawData);

      expect(template).toBeDefined();
      expect(template?.content).toBe('New message from ${sender_name}');
      expect(template?.metadata.variables).toEqual(['sender_name']);
    });

    it('should fallback to deprecated content field', () => {
      const rawData: RawNotificationData = {
        id: 'test-4',
        userId: 'user-1',
        channel: 'email',
        type: 'TRANSACTIONAL',
        content: 'Fallback content here',
        status: 'SENT',
        priority: 'MEDIUM',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const template = service.extractTemplate(rawData);

      expect(template).toBeDefined();
      expect(template?.content).toBe('Fallback content here');
    });

    it('should return null if no content found', () => {
      const rawData: RawNotificationData = {
        id: 'test-5',
        userId: 'user-1',
        channel: 'email',
        type: 'TRANSACTIONAL',
        status: 'SENT',
        priority: 'MEDIUM',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const template = service.extractTemplate(rawData);

      expect(template).toBeNull();
    });

    it('should extract metadata from notification', () => {
      const rawData: RawNotificationData = {
        id: 'test-6',
        userId: 'user-1',
        tenantId: 'tenant-1',
        channel: 'email',
        type: 'TRANSACTIONAL',
        subject: 'Test Subject',
        payload: { body: 'Test body' },
        status: 'SENT',
        priority: 'HIGH',
        sentAt: new Date('2024-01-02'),
        metadata: {
          category: 'password-reset',
          tags: ['security', 'password'],
          tone: 'professional',
          language: 'en',
        },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const template = service.extractTemplate(rawData);

      expect(template?.metadata.tenantId).toBe('tenant-1');
      expect(template?.metadata.subject).toBe('Test Subject');
      expect(template?.metadata.category).toBe('password-reset');
      expect(template?.metadata.tags).toEqual(['security', 'password']);
      expect(template?.metadata.tone).toBe('professional');
      expect(template?.metadata.language).toBe('en');
      expect(template?.metadata.lastUsedAt).toEqual(new Date('2024-01-02'));
    });

    it('should extract multiple variable formats', () => {
      const rawData: RawNotificationData = {
        id: 'test-7',
        userId: 'user-1',
        channel: 'email',
        type: 'TRANSACTIONAL',
        payload: {
          body: 'Hello {{name}}, your {order_id} is ready. Total: ${amount}. Code: %code%',
        },
        status: 'SENT',
        priority: 'MEDIUM',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const template = service.extractTemplate(rawData);

      expect(template?.metadata.variables).toContain('name');
      expect(template?.metadata.variables).toContain('order_id');
      expect(template?.metadata.variables).toContain('amount');
      expect(template?.metadata.variables).toContain('code');
      expect(template?.metadata.variables?.length).toBe(4);
    });
  });

  describe('extractBatch', () => {
    it('should extract multiple templates', () => {
      const rawDataList: RawNotificationData[] = [
        {
          id: 'test-1',
          userId: 'user-1',
          channel: 'email',
          type: 'TRANSACTIONAL',
          payload: { body: 'Content 1' },
          status: 'SENT',
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'test-2',
          userId: 'user-1',
          channel: 'sms',
          type: 'TRANSACTIONAL',
          payload: { message: 'Content 2' },
          status: 'SENT',
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'test-3',
          userId: 'user-1',
          channel: 'email',
          type: 'MARKETING',
          status: 'SENT',
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const templates = service.extractBatch(rawDataList);

      expect(templates).toHaveLength(2); // Third one has no content
      expect(templates[0].id).toBe('test-1');
      expect(templates[1].id).toBe('test-2');
    });

    it('should handle empty array', () => {
      const templates = service.extractBatch([]);
      expect(templates).toEqual([]);
    });
  });
});
