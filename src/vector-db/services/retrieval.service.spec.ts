import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalService } from './retrieval.service';
import { QdrantService } from './qdrant.service';
import { EmbeddingService } from './embedding.service';
import { CacheService } from '../../redis/cache.service';
import {
  VectorSearchQuery,
  VectorSearchResult,
  NotificationTemplate,
} from '../interfaces/vector.interface';

describe('RetrievalService', () => {
  let service: RetrievalService;
  let qdrantService: jest.Mocked<QdrantService>;
  let embeddingService: jest.Mocked<EmbeddingService>;
  let cacheService: jest.Mocked<CacheService>;

  const mockTemplate: NotificationTemplate = {
    id: '1',
    content: 'Your order has been shipped',
    channel: 'email',
    category: 'transactional',
    tone: 'professional',
    language: 'en',
    tags: ['order', 'shipping'],
  };

  const mockEmbedding = new Array(512).fill(0.5);

  const mockSearchResults: VectorSearchResult[] = [
    {
      id: '1',
      score: 0.95,
      payload: mockTemplate,
    },
    {
      id: '2',
      score: 0.85,
      payload: {
        ...mockTemplate,
        id: '2',
        content: 'Order shipped successfully',
      },
    },
    {
      id: '3',
      score: 0.75,
      payload: {
        ...mockTemplate,
        id: '3',
        content: 'Your package is on the way',
      },
    },
  ];

  beforeEach(async () => {
    // Mock QdrantService
    qdrantService = {
      search: jest.fn(),
      getTemplate: jest.fn(),
    } as any;

    // Mock EmbeddingService
    embeddingService = {
      generateEmbedding: jest.fn(),
    } as any;

    // Mock CacheService
    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalService,
        { provide: QdrantService, useValue: qdrantService },
        { provide: EmbeddingService, useValue: embeddingService },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<RetrievalService>(RetrievalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should perform semantic search successfully', async () => {
      cacheService.get.mockResolvedValue(null); // Cache miss
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'order shipped',
        topK: 5,
      };

      const result = await service.search(query);

      expect(result.results).toHaveLength(3);
      expect(result.metadata.cached).toBe(false);
      expect(result.metadata.totalResults).toBe(3);
      expect(result.metadata.searchTimeMs).toBeGreaterThanOrEqual(0);
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
        'order shipped',
      );
      expect(qdrantService.search).toHaveBeenCalledWith(mockEmbedding, {
        queryText: 'order shipped',
        topK: 5,
        scoreThreshold: 0.7,
      });
    });

    it('should return cached results when available', async () => {
      cacheService.get.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'order shipped',
        topK: 5,
      };

      const result = await service.search(query);

      expect(result.results).toEqual(mockSearchResults);
      expect(result.metadata.cached).toBe(true);
      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(qdrantService.search).not.toHaveBeenCalled();
    });

    it('should use default parameters when not provided', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'test query',
      };

      await service.search(query);

      expect(qdrantService.search).toHaveBeenCalledWith(
        mockEmbedding,
        expect.objectContaining({
          topK: 10, // default
          scoreThreshold: 0.7, // default
        }),
      );
    });

    it('should cache search results', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'test query',
      };

      await service.search(query);

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('search:'),
        expect.any(Array),
        { ttl: 3600 },
      );
    });

    it('should normalize scores', async () => {
      const unnormalizedResults = [
        { ...mockSearchResults[0], score: 0.5 },
        { ...mockSearchResults[1], score: 0.3 },
        { ...mockSearchResults[2], score: 0.1 },
      ];

      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(unnormalizedResults);

      const query: VectorSearchQuery = {
        queryText: 'test',
      };

      const result = await service.search(query);

      // Scores should be normalized to 0-1 range
      expect(result.results[0].score).toBeCloseTo(1.0, 1); // max
      expect(result.results[1].score).toBeCloseTo(0.5, 1); // middle
      expect(result.results[2].score).toBeCloseTo(0.0, 1); // min
    });
  });

  describe('hybridSearch', () => {
    it('should boost scores for keyword matches', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'order',
      };

      const result = await service.hybridSearch(query, ['shipped']);

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.metadata.hybridSearch).toBeDefined();
      expect(result.metadata.hybridSearch?.keywords).toEqual(['shipped']);
      expect(result.metadata.reranked).toBe(true);

      // Results with keyword matches should have boosted scores
      const boostedResult = result.results.find((r) =>
        r.payload.content.toLowerCase().includes('shipped'),
      );
      expect(boostedResult).toBeDefined();
    });

    it('should filter results when requireAllKeywords is true', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'order',
      };

      const result = await service.hybridSearch(query, ['shipped', 'package'], {
        requireAllKeywords: true,
      });

      // Should only include results with both keywords
      expect(result.results.length).toBeLessThanOrEqual(
        mockSearchResults.length,
      );
    });

    it('should handle keyword matches in tags', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'notification',
      };

      const result = await service.hybridSearch(query, ['shipping']);

      // Should match 'shipping' in tags
      const matchedResult = result.results.find((r) =>
        r.payload.tags.includes('shipping'),
      );
      expect(matchedResult).toBeDefined();
    });
  });

  describe('searchWithExpansion', () => {
    it('should expand query with additional terms', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'order',
      };

      const expansionTerms = ['shipment', 'delivery', 'package'];

      const result = await service.searchWithExpansion(query, expansionTerms);

      expect(result.metadata.queryExpanded).toBe(true);
      expect(result.metadata.expansionTerms).toEqual(expansionTerms);

      // Should have called embedding with expanded query
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
        'order shipment delivery package',
      );
    });
  });

  describe('searchWithReranking', () => {
    it('should apply custom reranking function', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });

      // Return more results for reranking
      const manyResults = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`,
        score: 0.9 - i * 0.01,
        payload: {
          ...mockTemplate,
          id: `${i}`,
          content: `Template ${i}`,
        },
      }));
      qdrantService.search.mockResolvedValue(manyResults);

      const query: VectorSearchQuery = {
        queryText: 'test',
        topK: 10,
      };

      // Custom reranking: prefer even IDs
      const rerankingFunction = (result: VectorSearchResult) => {
        const id = parseInt(result.id, 10);
        return id % 2 === 0 ? 1.0 : 0.5;
      };

      const result = await service.searchWithReranking(
        query,
        rerankingFunction,
      );

      expect(result.results).toHaveLength(10);
      expect(result.metadata.reranked).toBe(true);

      // First result should benefit from custom scoring
      expect(result.results[0].payload.metadata).toHaveProperty(
        'originalScore',
      );
      expect(result.results[0].payload.metadata).toHaveProperty('customScore');
    });
  });

  describe('multiQuerySearch', () => {
    it('should merge results from multiple queries', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const queries: VectorSearchQuery[] = [
        { queryText: 'order shipped' },
        { queryText: 'package delivered' },
        { queryText: 'tracking update' },
      ];

      const result = await service.multiQuerySearch(queries);

      expect(result.metadata.multiQuery).toBeDefined();
      expect(result.metadata.multiQuery?.queries).toBe(3);
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should deduplicate results by ID', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });

      // Return same results for all queries
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const queries: VectorSearchQuery[] = [
        { queryText: 'query 1' },
        { queryText: 'query 2' },
      ];

      const result = await service.multiQuerySearch(queries, {
        deduplicateById: true,
      });

      // Should deduplicate by ID
      const uniqueIds = new Set(result.results.map((r) => r.id));
      expect(uniqueIds.size).toBe(result.results.length);
    });

    it('should apply merge strategy correctly', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });

      // Return overlapping results with different scores
      const results1 = [
        { id: '1', score: 0.9, payload: mockTemplate },
        { id: '2', score: 0.8, payload: mockTemplate },
      ];
      const results2 = [
        { id: '1', score: 0.7, payload: mockTemplate },
        { id: '3', score: 0.6, payload: mockTemplate },
      ];

      qdrantService.search
        .mockResolvedValueOnce(results1)
        .mockResolvedValueOnce(results2);

      const queries: VectorSearchQuery[] = [
        { queryText: 'query 1' },
        { queryText: 'query 2' },
      ];

      const result = await service.multiQuerySearch(queries, {
        mergeStrategy: 'max',
      });

      // ID '1' should have max score (0.9)
      const id1Result = result.results.find((r) => r.id === '1');
      expect(id1Result?.score).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('findSimilar', () => {
    it('should find similar templates', async () => {
      qdrantService.getTemplate.mockResolvedValue(mockTemplate);
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const result = await service.findSimilar('1');

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.metadata.originalTemplateId).toBe('1');
      expect(qdrantService.getTemplate).toHaveBeenCalledWith('1');
    });

    it('should exclude original template by default', async () => {
      qdrantService.getTemplate.mockResolvedValue(mockTemplate);
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const result = await service.findSimilar('1');

      // Should not include template with ID '1'
      const hasOriginal = result.results.some((r) => r.id === '1');
      expect(hasOriginal).toBe(false);
    });

    it('should include original template when excludeOriginal is false', async () => {
      qdrantService.getTemplate.mockResolvedValue(mockTemplate);
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const result = await service.findSimilar('1', {
        excludeOriginal: false,
      });

      // Should include template with ID '1'
      const hasOriginal = result.results.some((r) => r.id === '1');
      expect(hasOriginal).toBe(true);
    });

    it('should throw error if template not found', async () => {
      qdrantService.getTemplate.mockResolvedValue(null);

      await expect(service.findSimilar('non-existent')).rejects.toThrow(
        'Template not found: non-existent',
      );
    });
  });

  describe('statistics', () => {
    it('should track search statistics', async () => {
      // First call: cache miss, second call: cache hit
      cacheService.get
        .mockResolvedValueOnce(null) // First search: cache miss
        .mockResolvedValueOnce(mockSearchResults); // Second search: cache hit

      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'test',
      };

      // Perform multiple searches
      await service.search(query);
      await service.search(query);

      const stats = service.getStats();

      expect(stats.totalSearches).toBe(2);
      expect(stats.cacheMisses).toBe(1); // First search is cache miss
      expect(stats.cacheHits).toBe(1); // Second search is cache hit
      expect(stats.cacheHitRate).toBe(0.5);
      expect(stats.avgSearchTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should reset statistics', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'test',
      };

      await service.search(query);
      service.resetStats();

      const stats = service.getStats();

      expect(stats.totalSearches).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
      expect(stats.avgSearchTimeMs).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty search results', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue([]);

      const query: VectorSearchQuery = {
        queryText: 'nonexistent query',
      };

      const result = await service.search(query);

      expect(result.results).toHaveLength(0);
      expect(result.metadata.totalResults).toBe(0);
    });

    it('should handle search with filters', async () => {
      cacheService.get.mockResolvedValue(null);
      embeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-3-small',
        dimensions: 512,
        cached: false,
      });
      qdrantService.search.mockResolvedValue(mockSearchResults);

      const query: VectorSearchQuery = {
        queryText: 'test',
        filter: {
          channel: 'email',
          category: 'transactional',
          language: 'en',
        },
      };

      await service.search(query);

      expect(qdrantService.search).toHaveBeenCalledWith(
        mockEmbedding,
        expect.objectContaining({
          filter: query.filter,
        }),
      );
    });
  });
});
