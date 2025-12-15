import { Test, TestingModule } from '@nestjs/testing';
import { ContextAssemblyService } from './context-assembly.service';
import {
  VectorSearchResult,
  NotificationTemplate,
} from '../interfaces/vector.interface';

describe('ContextAssemblyService', () => {
  let service: ContextAssemblyService;

  const createMockTemplate = (
    id: string,
    content: string,
    overrides?: Partial<NotificationTemplate>,
  ): NotificationTemplate => ({
    id,
    content,
    channel: 'email',
    category: 'transactional',
    tone: 'professional',
    language: 'en',
    tags: [],
    ...overrides,
  });

  const createMockResult = (
    id: string,
    score: number,
    content: string,
    overrides?: Partial<NotificationTemplate>,
  ): VectorSearchResult => ({
    id,
    score,
    payload: createMockTemplate(id, content, overrides),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContextAssemblyService],
    }).compile();

    service = module.get<ContextAssemblyService>(ContextAssemblyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assembleContext', () => {
    it('should assemble context from search results', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Your order has been shipped'),
        createMockResult('2', 0.85, 'Order shipped successfully'),
        createMockResult('3', 0.8, 'Your package is on the way'),
      ];

      const context = await service.assembleContext(
        results,
        'Generate order shipment notification',
      );

      expect(context.prompt).toBeDefined();
      expect(context.context).toBeDefined();
      expect(context.metadata).toBeDefined();
      expect(context.context.length).toBeGreaterThan(0);
      expect(context.context.length).toBeLessThanOrEqual(results.length);
    });

    it('should filter by relevance score', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'High relevance'),
        createMockResult('2', 0.6, 'Medium relevance'),
        createMockResult('3', 0.3, 'Low relevance'),
      ];

      const context = await service.assembleContext(results, 'Test query', {
        minScore: 0.5,
      });

      expect(context.context.length).toBe(2);
      expect(context.context.every((r) => r.score >= 0.5)).toBe(true);
      expect(context.metadata.relevantResults).toBe(2);
    });

    it('should deduplicate similar results', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Your order has been shipped today'),
        createMockResult('2', 0.85, 'Your order has been shipped today'), // Duplicate
        createMockResult('3', 0.8, 'Completely different notification'),
      ];

      const context = await service.assembleContext(results, 'Test query', {
        similarityThreshold: 0.9,
      });

      expect(context.metadata.deduplicatedResults).toBeLessThan(
        context.metadata.relevantResults,
      );
      expect(context.metadata.compressed).toBe(true);
    });

    it('should fit results into context window', async () => {
      const longContent = 'A'.repeat(1000); // ~250 tokens
      const results: VectorSearchResult[] = Array.from(
        { length: 100 },
        (_, i) => createMockResult(`${i}`, 0.9 - i * 0.001, longContent),
      );

      const context = await service.assembleContext(results, 'Test query', {
        maxTokens: 1000, // Limited budget
      });

      expect(context.metadata.totalTokens).toBeLessThanOrEqual(1000);
      expect(context.context.length).toBeLessThan(results.length);
      expect(context.metadata.utilizationPercent).toBeGreaterThanOrEqual(0);
    });

    it('should include metadata in assembled context', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Test content'),
      ];

      const context = await service.assembleContext(results, 'Test query');

      expect(context.metadata).toMatchObject({
        totalResults: expect.any(Number),
        relevantResults: expect.any(Number),
        deduplicatedResults: expect.any(Number),
        selectedResults: expect.any(Number),
        totalTokens: expect.any(Number),
        maxTokens: expect.any(Number),
        utilizationPercent: expect.any(Number),
        assemblyTimeMs: expect.any(Number),
        compressed: expect.any(Boolean),
      });
    });

    it('should use custom system prompt when provided', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Test content'),
      ];

      const customPrompt = 'You are a custom assistant';
      const context = await service.assembleContext(results, 'Test query', {
        systemPrompt: customPrompt,
      });

      expect(context.prompt).toContain(customPrompt);
    });

    it('should include template metadata in prompt', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Test content', {
          channel: 'sms',
          category: 'marketing',
          tone: 'casual',
          tags: ['promo', 'sale'],
        }),
      ];

      const context = await service.assembleContext(results, 'Test query');

      expect(context.prompt).toContain('sms');
      expect(context.prompt).toContain('marketing');
      expect(context.prompt).toContain('casual');
      expect(context.prompt).toContain('promo');
    });
  });

  describe('relevance filtering', () => {
    it('should filter out low relevance results', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'High'),
        createMockResult('2', 0.4, 'Low'),
        createMockResult('3', 0.8, 'Medium-High'),
      ];

      const context = await service.assembleContext(results, 'Test', {
        minScore: 0.5,
      });

      expect(context.context.every((r) => r.score >= 0.5)).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('should remove exact duplicates', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Same content'),
        createMockResult('1', 0.85, 'Same content'), // Same ID
        createMockResult('3', 0.8, 'Different content'),
      ];

      const context = await service.assembleContext(results, 'Test');

      // Should keep unique IDs
      const ids = context.context.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should remove near-duplicates based on content', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Your order has been shipped'),
        createMockResult('2', 0.85, 'Your order has been shipped'),
        createMockResult('3', 0.8, 'Completely different message'),
      ];

      const context = await service.assembleContext(results, 'Test', {
        similarityThreshold: 0.8,
      });

      expect(context.metadata.compressed).toBe(true);
      expect(context.metadata.deduplicatedResults).toBeLessThan(3);
    });
  });

  describe('diversity ranking', () => {
    it('should promote diversity in results', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'order shipped tracking'),
        createMockResult('2', 0.89, 'order shipped delivered'), // Similar to 1
        createMockResult('3', 0.88, 'payment received confirmation'), // Different topic
        createMockResult('4', 0.87, 'order shipped soon'), // Similar to 1
      ];

      const context = await service.assembleContext(results, 'Test', {
        diversityWeight: 0.5, // High diversity weight
      });

      // Should prefer diverse results over similar ones
      expect(context.context.length).toBeGreaterThan(0);
    });
  });

  describe('token management', () => {
    it('should estimate tokens correctly', async () => {
      const shortContent = 'Short'; // ~2 tokens
      const longContent = 'A'.repeat(400); // ~100 tokens

      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, shortContent),
        createMockResult('2', 0.85, longContent),
      ];

      const context = await service.assembleContext(results, 'Test');

      expect(context.metadata.totalTokens).toBeGreaterThan(0);
      expect(context.metadata.totalTokens).toBeLessThanOrEqual(
        context.metadata.maxTokens,
      );
    });

    it('should respect token budget', async () => {
      const content = 'A'.repeat(1000); // ~250 tokens each
      const results: VectorSearchResult[] = Array.from({ length: 20 }, (_, i) =>
        createMockResult(`${i}`, 0.9, content),
      );

      const maxTokens = 500;
      const context = await service.assembleContext(results, 'Test', {
        maxTokens,
      });

      expect(context.metadata.totalTokens).toBeLessThanOrEqual(maxTokens);
    });

    it('should calculate utilization percentage', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Test content'),
      ];

      const context = await service.assembleContext(results, 'Test', {
        maxTokens: 1000,
      });

      expect(context.metadata.utilizationPercent).toBeGreaterThanOrEqual(0);
      expect(context.metadata.utilizationPercent).toBeLessThanOrEqual(100);
    });
  });

  describe('prompt assembly', () => {
    it('should include user query in prompt', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Template'),
      ];

      const userQuery = 'Generate notification for order shipment';
      const context = await service.assembleContext(results, userQuery);

      expect(context.prompt).toContain(userQuery);
    });

    it('should format templates with metadata', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.95, 'Template content', {
          channel: 'email',
          category: 'transactional',
        }),
      ];

      const context = await service.assembleContext(results, 'Test');

      expect(context.prompt).toContain('Template 1');
      expect(context.prompt).toContain('Score: 0.95');
      expect(context.prompt).toContain('email');
      expect(context.prompt).toContain('transactional');
    });

    it('should include template separators', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Template 1'),
        createMockResult('2', 0.85, 'Template 2'),
      ];

      const context = await service.assembleContext(results, 'Test');

      expect(context.prompt).toContain('---'); // Separator
    });
  });

  describe('compressContext', () => {
    it('should compress context by target reduction', async () => {
      const results: VectorSearchResult[] = Array.from({ length: 10 }, (_, i) =>
        createMockResult(`${i}`, 0.9 - i * 0.01, `Template ${i}`),
      );

      const compressed = await service.compressContext(results, 0.5); // 50% reduction

      expect(compressed.length).toBe(5);
    });

    it('should return original if target reduction is 0', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Template'),
      ];

      const compressed = await service.compressContext(results, 0);

      expect(compressed).toEqual(results);
    });

    it('should select diverse subset when compressing', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'order shipped'),
        createMockResult('2', 0.89, 'order delivered'), // Similar
        createMockResult('3', 0.88, 'payment received'), // Different
        createMockResult('4', 0.87, 'account created'), // Different
      ];

      const compressed = await service.compressContext(results, 0.5);

      expect(compressed.length).toBe(2);
    });
  });

  describe('calculateContextDiversity', () => {
    it('should return 1.0 for single result', () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Single'),
      ];

      const diversity = service.calculateContextDiversity(results);

      expect(diversity).toBe(1.0);
    });

    it('should return low diversity for similar templates', () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'order shipped today'),
        createMockResult('2', 0.85, 'order shipped yesterday'),
        createMockResult('3', 0.8, 'order shipped soon'),
      ];

      const diversity = service.calculateContextDiversity(results);

      expect(diversity).toBeLessThanOrEqual(0.5); // High similarity = low diversity
    });

    it('should return high diversity for different templates', () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'order shipped'),
        createMockResult('2', 0.85, 'payment received'),
        createMockResult('3', 0.8, 'account created'),
      ];

      const diversity = service.calculateContextDiversity(results);

      expect(diversity).toBeGreaterThan(0.5); // Low similarity = high diversity
    });
  });

  describe('calculateContextCoverage', () => {
    it('should calculate coverage metrics', () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Template 1', {
          channel: 'email',
          category: 'transactional',
          tone: 'professional',
          tags: ['order', 'shipping'],
        }),
        createMockResult('2', 0.85, 'Template 2', {
          channel: 'sms',
          category: 'marketing',
          tone: 'casual',
          tags: ['promo'],
        }),
      ];

      const coverage = service.calculateContextCoverage(results);

      expect(coverage).toEqual({
        channels: 2,
        categories: 2,
        tones: 2,
        languages: 1,
        uniqueTags: 3,
        totalTemplates: 2,
      });
    });

    it('should count unique values correctly', () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Template 1', { channel: 'email' }),
        createMockResult('2', 0.85, 'Template 2', { channel: 'email' }), // Same
        createMockResult('3', 0.8, 'Template 3', { channel: 'sms' }),
      ];

      const coverage = service.calculateContextCoverage(results);

      expect(coverage.channels).toBe(2); // email, sms
      expect(coverage.totalTemplates).toBe(3);
    });
  });

  describe('statistics', () => {
    it('should track assembly statistics', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Template'),
      ];

      await service.assembleContext(results, 'Query 1');
      await service.assembleContext(results, 'Query 2');

      const stats = service.getStats();

      expect(stats.totalAssemblies).toBe(2);
      expect(stats.totalTokensUsed).toBeGreaterThan(0);
      expect(stats.avgContextSize).toBeGreaterThan(0);
      expect(stats.avgTokensPerAssembly).toBeGreaterThan(0);
    });

    it('should reset statistics', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Template'),
      ];

      await service.assembleContext(results, 'Query');
      service.resetStats();

      const stats = service.getStats();

      expect(stats.totalAssemblies).toBe(0);
      expect(stats.totalTokensUsed).toBe(0);
      expect(stats.avgContextSize).toBe(0);
      expect(stats.avgTokensPerAssembly).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should return configuration', () => {
      const config = service.getConfig();

      expect(config).toMatchObject({
        maxContextTokens: expect.any(Number),
        maxPromptTokens: expect.any(Number),
        maxCompletionTokens: expect.any(Number),
        minRelevanceScore: expect.any(Number),
        diversityWeight: expect.any(Number),
        avgTokensPerChar: expect.any(Number),
      });
    });

    it('should have reasonable defaults', () => {
      const config = service.getConfig();

      expect(config.maxContextTokens).toBeGreaterThan(0);
      expect(config.minRelevanceScore).toBeGreaterThanOrEqual(0);
      expect(config.minRelevanceScore).toBeLessThanOrEqual(1);
      expect(config.diversityWeight).toBeGreaterThanOrEqual(0);
      expect(config.diversityWeight).toBeLessThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty results', async () => {
      const context = await service.assembleContext([], 'Test query');

      expect(context.context).toEqual([]);
      expect(context.metadata.selectedResults).toBe(0);
      expect(context.metadata.totalTokens).toBe(0);
    });

    it('should handle single result', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.9, 'Single template'),
      ];

      const context = await service.assembleContext(results, 'Test');

      expect(context.context.length).toBe(1);
      expect(context.prompt).toContain('Single template');
    });

    it('should handle all low relevance results', async () => {
      const results: VectorSearchResult[] = [
        createMockResult('1', 0.3, 'Low 1'),
        createMockResult('2', 0.2, 'Low 2'),
      ];

      const context = await service.assembleContext(results, 'Test', {
        minScore: 0.5,
      });

      expect(context.context.length).toBe(0);
      expect(context.metadata.relevantResults).toBe(0);
    });
  });
});
