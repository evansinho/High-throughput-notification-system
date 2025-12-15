import { Test, TestingModule } from '@nestjs/testing';
import { TextChunkerService } from './text-chunker.service';
import { ChunkType, ChunkingStrategy } from '../../interfaces/chunk.interface';
import { TemplateDocument } from '../../interfaces/template-document.interface';

describe('TextChunkerService', () => {
  let service: TextChunkerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TextChunkerService],
    }).compile();

    service = module.get<TextChunkerService>(TextChunkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly using 4 chars per token heuristic', () => {
      const text = 'Hello world, this is a test.'; // 28 chars
      const result = service.estimateTokens(text);

      expect(result.tokens).toBe(Math.ceil(28 / 4)); // 7 tokens
      expect(result.characters).toBe(28);
      expect(result.words).toBe(6);
      expect(result.sentences).toBe(1);
    });

    it('should count multiple sentences correctly', () => {
      const text = 'First sentence. Second sentence! Third sentence?';
      const result = service.estimateTokens(text);

      expect(result.sentences).toBe(3);
      expect(result.words).toBe(6);
    });

    it('should count paragraphs correctly', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const result = service.estimateTokens(text);

      expect(result.paragraphs).toBe(3);
    });
  });

  describe('chunkTemplate - MICRO strategy', () => {
    it('should chunk SMS template with MICRO strategy', async () => {
      const template: TemplateDocument = {
        id: 'sms-001',
        content: 'Hi {{name}}, your order #{{orderId}} has shipped!',
        metadata: {
          channel: 'sms',
          type: 'TRANSACTIONAL',
          category: 'order',
          tags: ['shipping', 'order'],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      expect(result.strategy.type).toBe(ChunkType.MICRO);
      expect(result.strategy.maxTokens).toBe(100);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].metadata.chunkType).toBe(ChunkType.MICRO);
      expect(result.chunks[0].metadata.hasPersonalization).toBe(true);
      expect(result.chunks[0].metadata.variables).toContain('name');
      expect(result.chunks[0].metadata.variables).toContain('orderId');
    });

    it('should handle short content that fits in one chunk', async () => {
      const template: TemplateDocument = {
        id: 'push-001',
        content: 'New message from {{sender}}',
        metadata: {
          channel: 'push',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].metadata.completeness).toBe('complete');
      expect(result.chunks[0].metadata.totalChunks).toBe(1);
    });
  });

  describe('chunkTemplate - MACRO strategy', () => {
    it('should chunk email template with MACRO strategy', async () => {
      const template: TemplateDocument = {
        id: 'email-001',
        content: `Dear {{name}},

Thank you for your order #{{orderId}}. Your items have been shipped and should arrive within 3-5 business days.

Track your shipment: {{trackingLink}}

Best regards,
The Team`,
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          subject: 'Your order has shipped',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      expect(result.strategy.type).toBe(ChunkType.MACRO);
      expect(result.strategy.maxTokens).toBe(500);
      expect(result.strategy.respectParagraphBoundaries).toBe(true);
      expect(result.chunks[0].metadata.variables).toContain('name');
      expect(result.chunks[0].metadata.variables).toContain('orderId');
      expect(result.chunks[0].metadata.variables).toContain('trackingLink');
    });

    it('should include subject in chunks when specified', async () => {
      const template: TemplateDocument = {
        id: 'email-002',
        content: 'Body content here.',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          subject: 'Important Update',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const strategy: Partial<ChunkingStrategy> = {
        type: ChunkType.MICRO,
        includeSubjectInChunks: true,
      };

      const result = await service.chunkTemplate(template, strategy);

      expect(result.chunks[0].content).toContain('Important Update');
      expect(result.chunks[0].metadata.hasSubject).toBe(true);
    });
  });

  describe('chunkTemplate - MEGA strategy', () => {
    it('should chunk long marketing email with MEGA strategy', async () => {
      // Create content >800 tokens (>3200 characters)
      const baseContent = `
Dear Valued Customer,

We're excited to announce our biggest sale of the year! From now until the end of the month, enjoy up to 50% off on all products across all categories.

Shop now and discover amazing deals on a wide variety of items including:
- Electronics and gadgets with cutting-edge technology
- Home and garden supplies for all your outdoor and indoor needs
- Fashion and accessories from top brands
- Sports and outdoor equipment for every activity
- Books, music, and entertainment options
- Kitchen appliances and cookware
- Personal care and beauty products

Don't miss out on these incredible savings opportunities. Visit our website today and start shopping for the items you've always wanted!

Plus, sign up for our newsletter and get an additional 10% off your first purchase. Click here to subscribe and never miss a deal again!

Our customer service team is available 24/7 to help you with any questions or concerns you may have about your order.

Best regards,
The Marketing Team

P.S. This offer is valid for a limited time only, so act fast before items sell out!
      `.repeat(6); // 6x ~520 chars = ~3120 chars = ~780 tokens. Need more!

      const longContent = baseContent + baseContent; // Double it to exceed 800 tokens

      const template: TemplateDocument = {
        id: 'email-marketing-001',
        content: longContent,
        metadata: {
          channel: 'email',
          type: 'MARKETING',
          subject: 'Biggest Sale of the Year!',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      // Check that content is long enough to trigger MEGA (>800 tokens = >3200 chars)
      expect(result.originalLength).toBeGreaterThan(3200);
      expect(result.strategy.type).toBe(ChunkType.MEGA);
      expect(result.strategy.maxTokens).toBe(1500);
    });
  });

  describe('chunkTemplate - overlap strategy', () => {
    it('should create overlapping chunks', async () => {
      const template: TemplateDocument = {
        id: 'email-003',
        content: `First paragraph with some content here that should be split into multiple chunks.

Second paragraph with more content that continues the document and adds additional information.

Third paragraph with additional content that provides even more details about the topic.

Fourth paragraph with even more content to ensure we have enough text for multiple chunks.

Fifth paragraph with final content to complete this test document.`,
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const strategy: Partial<ChunkingStrategy> = {
        type: ChunkType.MACRO,
        maxTokens: 30, // Force multiple chunks (smaller limit)
        overlapPercentage: 20,
        respectParagraphBoundaries: true,
      };

      const result = await service.chunkTemplate(template, strategy);

      // Should have multiple chunks
      expect(result.chunks.length).toBeGreaterThan(1);

      // Check that chunks have correct metadata
      result.chunks.forEach((chunk, index) => {
        expect(chunk.metadata.chunkIndex).toBe(index);
        expect(chunk.metadata.totalChunks).toBe(result.chunks.length);
      });
    });

    it('should mark chunks with correct completeness', async () => {
      const template: TemplateDocument = {
        id: 'email-004',
        content: `Paragraph one.

Paragraph two.

Paragraph three.

Paragraph four.`,
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const strategy: Partial<ChunkingStrategy> = {
        type: ChunkType.MACRO,
        maxTokens: 20, // Force multiple chunks
      };

      const result = await service.chunkTemplate(template, strategy);

      if (result.chunks.length > 2) {
        expect(result.chunks[0].metadata.completeness).toBe('partial_start');
        expect(result.chunks[1].metadata.completeness).toBe('partial_middle');
        expect(
          result.chunks[result.chunks.length - 1].metadata.completeness,
        ).toBe('partial_end');
      } else if (result.chunks.length === 1) {
        expect(result.chunks[0].metadata.completeness).toBe('complete');
      }
    });
  });

  describe('chunkTemplate - call-to-action detection', () => {
    it('should detect call-to-action patterns', async () => {
      const template: TemplateDocument = {
        id: 'marketing-001',
        content:
          'Great deals available now! Click here to shop now and get started with amazing savings.',
        metadata: {
          channel: 'email',
          type: 'MARKETING',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      expect(result.chunks[0].metadata.hasCallToAction).toBe(true);
    });

    it('should not detect CTA in content without action words', async () => {
      const template: TemplateDocument = {
        id: 'transactional-001',
        content:
          'Your order has been confirmed. Thank you for shopping with us.',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      expect(result.chunks[0].metadata.hasCallToAction).toBe(false);
    });
  });

  describe('chunkTemplate - variable extraction', () => {
    it('should extract variables in different formats', async () => {
      const template: TemplateDocument = {
        id: 'test-variables',
        content:
          'Hello {{name}}, your account {userId} has ${balance} dollars and %discount% applied.',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      const variables = result.chunks[0].metadata.variables || [];
      expect(variables).toContain('name');
      expect(variables).toContain('userId');
      expect(variables).toContain('balance');
      expect(variables).toContain('discount');
    });

    it('should not extract empty placeholders', async () => {
      const template: TemplateDocument = {
        id: 'test-empty',
        content: 'Hello {{}} and ${} with valid {{name}}.',
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      const variables = result.chunks[0].metadata.variables || [];
      expect(variables).toContain('name');
      expect(variables).not.toContain('');
    });
  });

  describe('chunkTemplate - sentence completion', () => {
    it('should detect complete sentences', async () => {
      const template: TemplateDocument = {
        id: 'complete-sentence',
        content: 'This is a complete sentence.',
        metadata: {
          channel: 'sms',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      expect(result.chunks[0].metadata.sentenceComplete).toBe(true);
    });

    it('should detect incomplete sentences', async () => {
      const template: TemplateDocument = {
        id: 'incomplete-sentence',
        content: 'This is an incomplete',
        metadata: {
          channel: 'sms',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      expect(result.chunks[0].metadata.sentenceComplete).toBe(false);
    });
  });

  describe('chunkTemplate - metadata inheritance', () => {
    it('should inherit template metadata in chunks', async () => {
      const template: TemplateDocument = {
        id: 'metadata-test',
        content: 'Test content',
        metadata: {
          channel: 'email',
          type: 'MARKETING',
          category: 'promotion',
          tags: ['sale', 'discount'],
          tone: 'friendly',
          language: 'en',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      const chunk = result.chunks[0];
      expect(chunk.metadata.channel).toBe('email');
      expect(chunk.metadata.type).toBe('MARKETING');
      expect(chunk.metadata.category).toBe('promotion');
      expect(chunk.metadata.tags).toEqual(['sale', 'discount']);
      expect(chunk.metadata.tone).toBe('friendly');
      expect(chunk.metadata.language).toBe('en');
    });

    it('should set correct chunk index and total', async () => {
      const template: TemplateDocument = {
        id: 'index-test',
        content: `Para 1.

Para 2.

Para 3.

Para 4.`,
        metadata: {
          channel: 'email',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const strategy: Partial<ChunkingStrategy> = {
        type: ChunkType.MACRO,
        maxTokens: 10, // Force multiple chunks
      };

      const result = await service.chunkTemplate(template, strategy);

      result.chunks.forEach((chunk, index) => {
        expect(chunk.metadata.chunkIndex).toBe(index);
        expect(chunk.metadata.totalChunks).toBe(result.chunks.length);
        expect(chunk.id).toBe(`${template.id}_chunk_${index}`);
      });
    });
  });

  describe('chunkBatch', () => {
    it('should chunk multiple templates', async () => {
      const templates: TemplateDocument[] = [
        {
          id: 'batch-1',
          content: 'First template content',
          metadata: {
            channel: 'sms',
            type: 'TRANSACTIONAL',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: 'batch-2',
          content: 'Second template content',
          metadata: {
            channel: 'email',
            type: 'MARKETING',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];

      const results = await service.chunkBatch(templates);

      expect(results.size).toBe(2);
      expect(results.has('batch-1')).toBe(true);
      expect(results.has('batch-2')).toBe(true);

      const result1 = results.get('batch-1');
      const result2 = results.get('batch-2');

      expect(result1?.chunks.length).toBeGreaterThan(0);
      expect(result2?.chunks.length).toBeGreaterThan(0);
    });
  });

  describe('chunkTemplate - performance', () => {
    it('should track processing time', async () => {
      const template: TemplateDocument = {
        id: 'perf-test',
        content: 'Performance test content',
        metadata: {
          channel: 'sms',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeLessThan(1000); // Should be fast
    });

    it('should calculate average chunk size', async () => {
      const template: TemplateDocument = {
        id: 'avg-test',
        content: 'Test content for average calculation',
        metadata: {
          channel: 'sms',
          type: 'TRANSACTIONAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await service.chunkTemplate(template);

      const totalSize = result.chunks.reduce(
        (sum, chunk) => sum + chunk.content.length,
        0,
      );
      const expectedAvg = totalSize / result.chunks.length;

      expect(result.averageChunkSize).toBe(expectedAvg);
    });
  });
});
