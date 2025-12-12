import { Test, TestingModule } from '@nestjs/testing';
import { TemplateCleanerService } from './template-cleaner.service';
import { TemplateDocument } from '../../interfaces/template-document.interface';

describe('TemplateCleanerService', () => {
  let service: TemplateCleanerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateCleanerService],
    }).compile();

    service = module.get<TemplateCleanerService>(TemplateCleanerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('clean', () => {
    it('should normalize whitespace by default', () => {
      const template: TemplateDocument = {
        id: 'test-1',
        content: 'Hello    world\n\n\n\nNew   paragraph',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const cleaned = service.clean(template);

      expect(cleaned.content).toBe('Hello world\n\nNew paragraph');
      expect(cleaned.metadata.length).toBe(cleaned.content.length);
    });

    it('should remove HTML tags when requested', () => {
      const template: TemplateDocument = {
        id: 'test-2',
        content: '<p>Hello <strong>world</strong></p><br/><div>Content</div>',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const cleaned = service.clean(template, { removeHtml: true });

      expect(cleaned.content).not.toContain('<p>');
      expect(cleaned.content).not.toContain('</p>');
      expect(cleaned.content).toContain('Hello world');
      expect(cleaned.content).toContain('Content');
    });

    it('should remove script tags', () => {
      const template: TemplateDocument = {
        id: 'test-3',
        content:
          '<p>Safe content</p><script>alert("xss")</script><p>More content</p>',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const cleaned = service.clean(template, { removeHtml: true });

      expect(cleaned.content).not.toContain('script');
      expect(cleaned.content).not.toContain('alert');
      expect(cleaned.content).toContain('Safe content');
      expect(cleaned.content).toContain('More content');
    });

    it('should decode HTML entities', () => {
      const template: TemplateDocument = {
        id: 'test-4',
        content: 'Hello &amp; welcome! It&apos;s &quot;great&quot;',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const cleaned = service.clean(template, { removeHtml: true });

      expect(cleaned.content).toContain('&');
      expect(cleaned.content).toContain("'");
      expect(cleaned.content).toContain('"');
      expect(cleaned.content).toBe('Hello & welcome! It\'s "great"');
    });

    it('should preserve variables during cleaning', () => {
      const template: TemplateDocument = {
        id: 'test-5',
        content: '<p>Hello {{user_name}}, your {order_id} is ${status}</p>',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const cleaned = service.clean(template, {
        removeHtml: true,
        extractVariables: true,
      });

      expect(cleaned.content).toContain('{{user_name}}');
      expect(cleaned.content).toContain('{order_id}');
      expect(cleaned.content).toContain('${status}');
      expect(cleaned.metadata.variables).toContain('user_name');
      expect(cleaned.metadata.variables).toContain('order_id');
      expect(cleaned.metadata.variables).toContain('status');
    });

    it('should truncate content to max length', () => {
      const template: TemplateDocument = {
        id: 'test-6',
        content: 'A'.repeat(1000),
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const cleaned = service.clean(template, { maxLength: 100 });

      expect(cleaned.content.length).toBe(100);
    });

    it('should convert line breaks to newlines', () => {
      const template: TemplateDocument = {
        id: 'test-7',
        content: 'Line 1<br>Line 2<br/>Line 3</p>Paragraph</div>Block',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
        },
      };

      const cleaned = service.clean(template, { removeHtml: true });

      expect(cleaned.content).toContain('\n');
      expect(cleaned.content.split('\n').length).toBeGreaterThan(1);
    });
  });

  describe('removeDuplicates', () => {
    it('should remove duplicate templates', () => {
      const templates: TemplateDocument[] = [
        {
          id: 'test-1',
          content: 'Hello {{user_name}}, welcome!',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-2',
          content: 'Hello {{first_name}}, welcome!', // Same template, different variable
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-3',
          content: 'Different content here',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
      ];

      const deduplicated = service.removeDuplicates(templates);

      expect(deduplicated.length).toBe(2);
      expect(deduplicated.some((t) => t.id === 'test-1')).toBe(true);
      expect(deduplicated.some((t) => t.id === 'test-3')).toBe(true);
    });

    it('should consider whitespace-normalized content', () => {
      const templates: TemplateDocument[] = [
        {
          id: 'test-1',
          content: 'Hello    world',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-2',
          content: 'Hello world', // Same content, different whitespace
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
      ];

      const deduplicated = service.removeDuplicates(templates);

      expect(deduplicated.length).toBe(1);
    });

    it('should keep all templates if no duplicates', () => {
      const templates: TemplateDocument[] = [
        {
          id: 'test-1',
          content: 'Content 1',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-2',
          content: 'Content 2',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
      ];

      const deduplicated = service.removeDuplicates(templates);

      expect(deduplicated.length).toBe(2);
    });
  });

  describe('cleanBatch', () => {
    it('should clean multiple templates', () => {
      const templates: TemplateDocument[] = [
        {
          id: 'test-1',
          content: '<p>Content   1</p>',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-2',
          content: '<div>Content   2</div>',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
      ];

      const cleaned = service.cleanBatch(templates, { removeHtml: true });

      expect(cleaned).toHaveLength(2);
      expect(cleaned[0].content).not.toContain('<p>');
      expect(cleaned[1].content).not.toContain('<div>');
    });

    it('should remove duplicates when requested', () => {
      const templates: TemplateDocument[] = [
        {
          id: 'test-1',
          content: 'Same content',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-2',
          content: 'Same content',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
        {
          id: 'test-3',
          content: 'Different content',
          metadata: {
            channel: 'email',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
          },
        },
      ];

      const cleaned = service.cleanBatch(templates, { removeDuplicates: true });

      expect(cleaned.length).toBe(2);
    });
  });

  describe('sanitize', () => {
    it('should remove script tags', () => {
      const content = '<p>Safe</p><script>alert("xss")</script>';
      const sanitized = service.sanitize(content);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    it('should remove event handlers', () => {
      const content = '<button onclick="malicious()">Click</button>';
      const sanitized = service.sanitize(content);

      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('malicious');
    });

    it('should remove javascript: protocol', () => {
      const content = '<a href="javascript:alert(1)">Link</a>';
      const sanitized = service.sanitize(content);

      expect(sanitized.toLowerCase()).not.toContain('javascript:');
    });
  });
});
