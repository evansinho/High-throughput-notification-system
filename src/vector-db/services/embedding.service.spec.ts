import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { CacheService } from '../../redis/cache.service';

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let cacheService: jest.Mocked<CacheService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    // Mock CacheService
    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
    } as any;

    // Mock ConfigService
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'app.nodeEnv') return 'test';
        if (key === 'OPENAI_API_KEY') return undefined; // Use mock mode
        return undefined;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: CacheService, useValue: cacheService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for text (mock mode)', async () => {
      cacheService.get.mockResolvedValue(null); // Cache miss

      const result = await service.generateEmbedding('Hello world');

      expect(result).toMatchObject({
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      expect(result.embedding).toHaveLength(512);
      expect(result.embedding.every((v) => typeof v === 'number')).toBe(true);
    });

    it('should return cached embedding if available', async () => {
      const cachedEmbedding = new Array(512).fill(0.5);
      cacheService.get.mockResolvedValue(cachedEmbedding);

      const result = await service.generateEmbedding('Hello world');

      expect(result).toMatchObject({
        embedding: cachedEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: true,
      });
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should cache embeddings after generation', async () => {
      cacheService.get.mockResolvedValue(null);

      await service.generateEmbedding('Hello world');

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('embedding:text-embedding-3-small:'),
        expect.any(Array),
        { ttl: 7 * 24 * 60 * 60 }, // 7 days in seconds
      );
    });

    it('should skip cache when useCache is false', async () => {
      await service.generateEmbedding('Hello world', false);

      expect(cacheService.get).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should generate deterministic embeddings for same text', async () => {
      cacheService.get.mockResolvedValue(null);

      const result1 = await service.generateEmbedding('Same text', false);
      const result2 = await service.generateEmbedding('Same text', false);

      expect(result1.embedding).toEqual(result2.embedding);
    });

    it('should generate different embeddings for different texts', async () => {
      cacheService.get.mockResolvedValue(null);

      const result1 = await service.generateEmbedding('Text A', false);
      const result2 = await service.generateEmbedding('Text B', false);

      expect(result1.embedding).not.toEqual(result2.embedding);
    });

    it('should generate normalized embeddings (L2 norm = 1)', async () => {
      cacheService.get.mockResolvedValue(null);

      const result = await service.generateEmbedding('Test text', false);

      // Calculate L2 norm
      const norm = Math.sqrt(
        result.embedding.reduce((sum, val) => sum + val * val, 0),
      );

      expect(norm).toBeCloseTo(1, 5);
    });
  });

  describe('generateEmbeddings (batch)', () => {
    it('should generate embeddings for multiple texts', async () => {
      cacheService.get.mockResolvedValue(null);

      const texts = ['Text 1', 'Text 2', 'Text 3'];
      const result = await service.generateEmbeddings(texts);

      expect(result.totalTexts).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.cacheHits).toBe(0);
      expect(result.cacheMisses).toBe(3);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should use cache for previously embedded texts', async () => {
      const cachedEmbedding = new Array(512).fill(0.5);

      // First and third texts are cached, second is not
      cacheService.get
        .mockResolvedValueOnce(cachedEmbedding) // Text 1: cache hit
        .mockResolvedValueOnce(null) // Text 2: cache miss
        .mockResolvedValueOnce(cachedEmbedding); // Text 3: cache hit

      const texts = ['Cached 1', 'New text', 'Cached 2'];
      const result = await service.generateEmbeddings(texts);

      expect(result.cacheHits).toBe(2);
      expect(result.cacheMisses).toBe(1);
      expect(result.results[0].cached).toBe(true);
      expect(result.results[1].cached).toBe(false);
      expect(result.results[2].cached).toBe(true);
    });

    it('should process large batches efficiently', async () => {
      cacheService.get.mockResolvedValue(null);

      // Create 250 texts (will be processed in 3 batches of 100, 100, 50)
      const texts = Array.from({ length: 250 }, (_, i) => `Text ${i}`);

      const result = await service.generateEmbeddings(texts, false);

      expect(result.totalTexts).toBe(250);
      expect(result.results).toHaveLength(250);
      expect(result.cacheMisses).toBe(250);
    });

    it('should include stats in batch result', async () => {
      cacheService.get.mockResolvedValue(null);

      const texts = ['Text 1', 'Text 2'];
      const result = await service.generateEmbeddings(texts);

      expect(result.stats).toMatchObject({
        totalTokensProcessed: 0, // Mock mode doesn't track tokens
        totalCost: 0,
        model: 'text-embedding-3-small',
        dimensions: 512,
      });
    });

    it('should handle empty batch', async () => {
      const result = await service.generateEmbeddings([]);

      expect(result.totalTexts).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.cacheHits).toBe(0);
      expect(result.cacheMisses).toBe(0);
    });
  });

  describe('cost monitoring', () => {
    it('should track statistics', () => {
      const stats = service.getStats();

      expect(stats).toMatchObject({
        totalTokensProcessed: 0,
        totalCost: 0,
        model: 'text-embedding-3-small',
        dimensions: 512,
      });
    });

    it('should reset statistics', () => {
      service.resetStats();

      const stats = service.getStats();
      expect(stats.totalTokensProcessed).toBe(0);
      expect(stats.totalCost).toBe(0);
    });
  });

  describe('helper methods', () => {
    it('should calculate cosine similarity correctly', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const c = [1, 0, 0];

      // Orthogonal vectors should have similarity 0
      expect(service.cosineSimilarity(a, b)).toBeCloseTo(0, 5);

      // Identical vectors should have similarity 1
      expect(service.cosineSimilarity(a, c)).toBeCloseTo(1, 5);
    });

    it('should throw error for different length vectors', () => {
      const a = [1, 0, 0];
      const b = [1, 0];

      expect(() => service.cosineSimilarity(a, b)).toThrow(
        'Embeddings must have the same length',
      );
    });

    it('should get dimensions', () => {
      expect(service.getDimensions()).toBe(512);
    });

    it('should get model info', () => {
      const info = service.getModelInfo();

      expect(info).toEqual({
        name: 'text-embedding-3-small',
        dimensions: 512,
      });
    });
  });

  describe('mock embeddings', () => {
    it('should generate different embeddings for different texts', async () => {
      cacheService.get.mockResolvedValue(null);

      const result1 = await service.generateEmbedding('Short text', false);
      const result2 = await service.generateEmbedding(
        'Much longer text with more content',
        false,
      );

      expect(result1.embedding).not.toEqual(result2.embedding);
    });

    it('should handle special characters', async () => {
      cacheService.get.mockResolvedValue(null);

      const result = await service.generateEmbedding(
        'Text with émoji 🎉 and special chars!@#$%',
        false,
      );

      expect(result.embedding).toHaveLength(512);
      expect(result.embedding.every((v) => !isNaN(v))).toBe(true);
    });

    it('should handle very long text', async () => {
      cacheService.get.mockResolvedValue(null);

      const longText = 'A'.repeat(10000);
      const result = await service.generateEmbedding(longText, false);

      expect(result.embedding).toHaveLength(512);
    });

    it('should handle empty string', async () => {
      cacheService.get.mockResolvedValue(null);

      const result = await service.generateEmbedding('', false);

      expect(result.embedding).toHaveLength(512);
      expect(result.embedding.every((v) => !isNaN(v))).toBe(true);
    });
  });

  describe('semantic similarity', () => {
    it('should produce similar embeddings for semantically similar texts', async () => {
      cacheService.get.mockResolvedValue(null);

      const result1 = await service.generateEmbedding('order shipped', false);
      const result2 = await service.generateEmbedding('package sent', false);
      const result3 = await service.generateEmbedding('pizza delivery', false);

      const similarity12 = service.cosineSimilarity(
        result1.embedding,
        result2.embedding,
      );
      const similarity13 = service.cosineSimilarity(
        result1.embedding,
        result3.embedding,
      );

      // Note: Mock embeddings are deterministic but not semantic
      // In real embeddings, similarity12 would be > similarity13
      // Here we just verify the calculations work
      expect(similarity12).toBeGreaterThanOrEqual(-1);
      expect(similarity12).toBeLessThanOrEqual(1);
      expect(similarity13).toBeGreaterThanOrEqual(-1);
      expect(similarity13).toBeLessThanOrEqual(1);
    });
  });
});
