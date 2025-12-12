import { Test, TestingModule } from '@nestjs/testing';
import { TemplateValidatorService } from './template-validator.service';
import { TemplateDocument } from '../../interfaces/template-document.interface';

describe('TemplateValidatorService', () => {
  let service: TemplateValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateValidatorService],
    }).compile();

    service = module.get<TemplateValidatorService>(TemplateValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate', () => {
    it('should validate a valid template', () => {
      const template: TemplateDocument = {
        id: 'test-1',
        content: 'Hello {{user_name}}, welcome to our platform!',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          subject: 'Welcome',
          createdAt: new Date('2024-01-01'),
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject template with empty content', () => {
      const template: TemplateDocument = {
        id: 'test-2',
        content: '',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'content')).toBe(true);
    });

    it('should reject template with missing ID', () => {
      const template: TemplateDocument = {
        id: '',
        content: 'Some content',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('should reject template with invalid channel', () => {
      const template: TemplateDocument = {
        id: 'test-3',
        content: 'Some content',
        metadata: {
          channel: 'invalid-channel',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'metadata.channel')).toBe(
        true,
      );
    });

    it('should reject template with invalid type', () => {
      const template: TemplateDocument = {
        id: 'test-4',
        content: 'Some content',
        metadata: {
          channel: 'email',
          type: 'INVALID-TYPE',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'metadata.type')).toBe(true);
    });

    it('should warn about missing subject for email', () => {
      const template: TemplateDocument = {
        id: 'test-5',
        content: 'Email content without subject',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.field === 'metadata.subject')).toBe(
        true,
      );
    });

    it('should warn about long SMS content', () => {
      const template: TemplateDocument = {
        id: 'test-6',
        content: 'A'.repeat(200),
        metadata: {
          channel: 'sms',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.field === 'content')).toBe(true);
    });

    it('should reject template with content too short', () => {
      const template: TemplateDocument = {
        id: 'test-7',
        content: 'Hi',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'content')).toBe(true);
    });

    it('should warn about empty placeholders', () => {
      const template: TemplateDocument = {
        id: 'test-8',
        content: 'Hello {{}}, your order {{}} is ready',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(
        result.warnings.some(
          (w) =>
            w.field === 'content' && w.message.includes('empty placeholders'),
        ),
      ).toBe(true);
    });

    it('should warn about suspicious patterns', () => {
      const template: TemplateDocument = {
        id: 'test-9',
        content: 'Hello <script>alert("xss")</script>',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const result = service.validate(template);

      expect(
        result.warnings.some((w) =>
          w.message.includes('potentially problematic patterns'),
        ),
      ).toBe(true);
    });

    it('should reject invalid performance metrics', () => {
      const template: TemplateDocument = {
        id: 'test-10',
        content: 'Valid content here',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          openRate: 1.5, // Invalid: should be 0-1
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'metadata.openRate')).toBe(
        true,
      );
    });

    it('should reject illogical metrics (delivered > sent)', () => {
      const template: TemplateDocument = {
        id: 'test-11',
        content: 'Valid content here',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          totalSent: 100,
          totalDelivered: 150,
        },
      };

      const result = service.validate(template);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'metadata.totalDelivered'),
      ).toBe(true);
    });
  });

  describe('validateBatch', () => {
    it('should validate multiple templates', () => {
      const templates: TemplateDocument[] = [
        {
          id: 'test-1',
          content: 'Valid content 1',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-2',
          content: 'Valid content 2',
          metadata: {
            channel: 'sms',
            type: 'MARKETING',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-3',
          content: '',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
      ];

      const results = service.validateBatch(templates);

      expect(results.size).toBe(3);
      expect(results.get('test-1')?.isValid).toBe(true);
      expect(results.get('test-2')?.isValid).toBe(true);
      expect(results.get('test-3')?.isValid).toBe(false);
    });
  });
});
