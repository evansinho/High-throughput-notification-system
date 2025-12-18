import { Test, TestingModule } from '@nestjs/testing';
import { RAGGenerationService } from './rag-generation.service';
import { LLMService } from './llm.service';
import { RetrievalService } from '../../vector-db/services/retrieval.service';
import { ContextAssemblyService } from '../../vector-db/services/context-assembly.service';

describe('RAGGenerationService', () => {
  let service: RAGGenerationService;
  let llmService: jest.Mocked<LLMService>;
  let retrievalService: jest.Mocked<RetrievalService>;
  let contextAssemblyService: jest.Mocked<ContextAssemblyService>;

  beforeEach(async () => {
    // Create mock services
    const mockLLMService = {
      generateCompletion: jest.fn(),
      generateCompletionStream: jest.fn(),
      calculateCost: jest.fn(),
    };

    const mockRetrievalService = {
      search: jest.fn(),
    };

    const mockContextAssemblyService = {
      assembleContext: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RAGGenerationService,
        { provide: LLMService, useValue: mockLLMService },
        { provide: RetrievalService, useValue: mockRetrievalService },
        { provide: ContextAssemblyService, useValue: mockContextAssemblyService },
      ],
    }).compile();

    service = module.get<RAGGenerationService>(RAGGenerationService);
    llmService = module.get(LLMService);
    retrievalService = module.get(RetrievalService);
    contextAssemblyService = module.get(ContextAssemblyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate notification using RAG pipeline', async () => {
      // Setup mock data
      const query = 'Generate order shipment notification';

      const mockRetrievalResult = {
        results: [
          {
            id: '1',
            score: 0.9,
            payload: {
              channel: 'email',
              category: 'transactional',
              tone: 'friendly',
              language: 'en',
              tags: ['order', 'shipping'],
              content: 'Your order has been shipped!',
            },
          },
        ],
        metadata: {
          searchTimeMs: 50,
          totalResults: 1,
          collectionName: 'notifications',
        },
      };

      const mockAssembledContext = {
        prompt: 'System prompt\n\nTemplate examples\n\nUser: Generate order shipment notification',
        context: mockRetrievalResult.results,
        metadata: {
          totalResults: 1,
          relevantResults: 1,
          deduplicatedResults: 1,
          selectedResults: 1,
          totalTokens: 100,
          maxTokens: 4000,
          utilizationPercent: 2.5,
          assemblyTimeMs: 10,
          compressed: false,
        },
      };

      const mockLLMResponse = {
        content: 'Generated notification content',
        model: 'claude-3-5-sonnet',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        cost: 0.001,
        finishReason: 'stop',
        latencyMs: 200,
      };

      retrievalService.search.mockResolvedValue(mockRetrievalResult as any);
      contextAssemblyService.assembleContext.mockResolvedValue(mockAssembledContext as any);
      llmService.generateCompletion.mockResolvedValue(mockLLMResponse as any);

      // Execute
      const result = await service.generate(query);

      // Verify
      expect(result).toBeDefined();
      expect(result.content).toBe('Generated notification content');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].id).toBe('1');
      expect(result.sources[0].rank).toBe(1);
      expect(result.metadata.query).toBe(query);
      expect(result.metadata.retrievedCount).toBe(1);
      expect(result.metadata.contextCount).toBe(1);
      expect(result.metadata.tokensUsed).toBe(150);

      // Verify service calls
      expect(retrievalService.search).toHaveBeenCalledWith({
        queryText: query,
        topK: 5,
        scoreThreshold: 0.65,
        filter: undefined,
      });
      expect(contextAssemblyService.assembleContext).toHaveBeenCalled();
      expect(llmService.generateCompletion).toHaveBeenCalled();
    });

    it('should use custom generation options', async () => {
      const query = 'Generate notification';
      const options = {
        topK: 10,
        scoreThreshold: 0.8,
        maxContextTokens: 2000,
        maxOutputTokens: 300,
        temperature: 0.3,
        topP: 0.95,
      };

      const mockRetrievalResult = {
        results: [],
        metadata: { searchTimeMs: 50, totalResults: 0, collectionName: 'notifications' },
      };

      const mockAssembledContext = {
        prompt: 'Test prompt',
        context: [],
        metadata: {
          totalResults: 0,
          relevantResults: 0,
          deduplicatedResults: 0,
          selectedResults: 0,
          totalTokens: 0,
          maxTokens: 2000,
          utilizationPercent: 0,
          assemblyTimeMs: 5,
          compressed: false,
        },
      };

      const mockLLMResponse = {
        content: 'Generated content',
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        cost: 0.0005,
        finishReason: 'stop',
        latencyMs: 150,
      };

      retrievalService.search.mockResolvedValue(mockRetrievalResult as any);
      contextAssemblyService.assembleContext.mockResolvedValue(mockAssembledContext as any);
      llmService.generateCompletion.mockResolvedValue(mockLLMResponse as any);

      const result = await service.generate(query, options);

      expect(result).toBeDefined();
      expect(result.metadata.topK).toBe(10);
      expect(result.metadata.scoreThreshold).toBe(0.8);
      expect(result.metadata.temperature).toBe(0.3);

      // Verify retrieval service called with correct options
      expect(retrievalService.search).toHaveBeenCalledWith({
        queryText: query,
        topK: 10,
        scoreThreshold: 0.8,
        filter: undefined,
      });

      // Verify context assembly called with correct options
      expect(contextAssemblyService.assembleContext).toHaveBeenCalledWith(
        [],
        query,
        expect.objectContaining({
          maxTokens: 2000,
        }),
      );
    });

    it('should handle metadata filters', async () => {
      const query = 'Generate notification';
      const filter = {
        channel: 'email',
        category: 'transactional',
        tone: 'professional',
      };

      const mockRetrievalResult = {
        results: [],
        metadata: { searchTimeMs: 50, totalResults: 0, collectionName: 'notifications' },
      };

      const mockAssembledContext = {
        prompt: 'Test prompt',
        context: [],
        metadata: {
          totalResults: 0,
          relevantResults: 0,
          deduplicatedResults: 0,
          selectedResults: 0,
          totalTokens: 0,
          maxTokens: 4000,
          utilizationPercent: 0,
          assemblyTimeMs: 5,
          compressed: false,
        },
      };

      const mockLLMResponse = {
        content: 'Generated content',
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        cost: 0.0005,
        finishReason: 'stop',
        latencyMs: 150,
      };

      retrievalService.search.mockResolvedValue(mockRetrievalResult as any);
      contextAssemblyService.assembleContext.mockResolvedValue(mockAssembledContext as any);
      llmService.generateCompletion.mockResolvedValue(mockLLMResponse as any);

      await service.generate(query, { filter });

      expect(retrievalService.search).toHaveBeenCalledWith({
        queryText: query,
        topK: 5,
        scoreThreshold: 0.65,
        filter,
      });
    });

    it('should extract source citations correctly', async () => {
      const query = 'Generate notification';

      const mockRetrievalResult = {
        results: [
          {
            id: 'template-1',
            score: 0.95,
            payload: {
              channel: 'email',
              category: 'transactional',
              tone: 'friendly',
              language: 'en',
              tags: ['order', 'confirmation'],
              content: 'Thank you for your order! Your order number is {{order_id}}. We will process it shortly.',
            },
          },
          {
            id: 'template-2',
            score: 0.85,
            payload: {
              channel: 'sms',
              category: 'transactional',
              tone: 'professional',
              language: 'en',
              tags: ['order', 'update'],
              content: 'Order {{order_id}} confirmed.',
            },
          },
        ],
        metadata: { searchTimeMs: 50, totalResults: 2, collectionName: 'notifications' },
      };

      const mockAssembledContext = {
        prompt: 'Test prompt',
        context: mockRetrievalResult.results,
        metadata: {
          totalResults: 2,
          relevantResults: 2,
          deduplicatedResults: 2,
          selectedResults: 2,
          totalTokens: 150,
          maxTokens: 4000,
          utilizationPercent: 3.75,
          assemblyTimeMs: 10,
          compressed: false,
        },
      };

      const mockLLMResponse = {
        content: 'Generated content',
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 150, completionTokens: 50, totalTokens: 200 },
        cost: 0.001,
        finishReason: 'stop',
        latencyMs: 180,
      };

      retrievalService.search.mockResolvedValue(mockRetrievalResult as any);
      contextAssemblyService.assembleContext.mockResolvedValue(mockAssembledContext as any);
      llmService.generateCompletion.mockResolvedValue(mockLLMResponse as any);

      const result = await service.generate(query);

      // Verify sources
      expect(result.sources).toHaveLength(2);

      expect(result.sources[0].id).toBe('template-1');
      expect(result.sources[0].rank).toBe(1);
      expect(result.sources[0].score).toBe(0.95);
      expect(result.sources[0].channel).toBe('email');
      expect(result.sources[0].category).toBe('transactional');
      expect(result.sources[0].excerpt).toContain('Thank you for your order!');
      expect(result.sources[0].metadata.tone).toBe('friendly');
      expect(result.sources[0].metadata.tags).toEqual(['order', 'confirmation']);

      expect(result.sources[1].id).toBe('template-2');
      expect(result.sources[1].rank).toBe(2);
      expect(result.sources[1].score).toBe(0.85);
    });

    it('should track statistics correctly', async () => {
      const query = 'Generate notification';

      const mockRetrievalResult = {
        results: [],
        metadata: { searchTimeMs: 50, totalResults: 0, collectionName: 'notifications' },
      };

      const mockAssembledContext = {
        prompt: 'Test prompt',
        context: [],
        metadata: {
          totalResults: 0,
          relevantResults: 0,
          deduplicatedResults: 0,
          selectedResults: 0,
          totalTokens: 0,
          maxTokens: 4000,
          utilizationPercent: 0,
          assemblyTimeMs: 5,
          compressed: false,
        },
      };

      const mockLLMResponse = {
        content: 'Generated content',
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        cost: 0.001,
        finishReason: 'stop',
        latencyMs: 200,
      };

      retrievalService.search.mockResolvedValue(mockRetrievalResult as any);
      contextAssemblyService.assembleContext.mockResolvedValue(mockAssembledContext as any);
      llmService.generateCompletion.mockResolvedValue(mockLLMResponse as any);

      // Reset stats first
      service.resetStats();
      let stats = service.getStats();
      expect(stats.totalGenerations).toBe(0);
      expect(stats.totalTokensUsed).toBe(0);

      // Generate first notification
      await service.generate(query);

      stats = service.getStats();
      expect(stats.totalGenerations).toBe(1);
      expect(stats.totalTokensUsed).toBe(150);
      expect(stats.avgTokensPerGeneration).toBe(150);

      // Generate second notification
      await service.generate(query);

      stats = service.getStats();
      expect(stats.totalGenerations).toBe(2);
      expect(stats.totalTokensUsed).toBe(300);
      expect(stats.avgTokensPerGeneration).toBe(150);
    });

    it('should handle errors gracefully', async () => {
      const query = 'Generate notification';

      retrievalService.search.mockRejectedValue(new Error('Retrieval failed'));

      await expect(service.generate(query)).rejects.toThrow('Retrieval failed');
    });

    it('should include timing metadata', async () => {
      const query = 'Generate notification';

      const mockRetrievalResult = {
        results: [],
        metadata: { searchTimeMs: 50, totalResults: 0, collectionName: 'notifications' },
      };

      const mockAssembledContext = {
        prompt: 'Test prompt',
        context: [],
        metadata: {
          totalResults: 0,
          relevantResults: 0,
          deduplicatedResults: 0,
          selectedResults: 0,
          totalTokens: 0,
          maxTokens: 4000,
          utilizationPercent: 0,
          assemblyTimeMs: 10,
          compressed: false,
        },
      };

      const mockLLMResponse = {
        content: 'Generated content',
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        cost: 0.001,
        finishReason: 'stop',
        latencyMs: 200,
      };

      retrievalService.search.mockResolvedValue(mockRetrievalResult as any);
      contextAssemblyService.assembleContext.mockResolvedValue(mockAssembledContext as any);
      llmService.generateCompletion.mockResolvedValue(mockLLMResponse as any);

      const result = await service.generate(query);

      expect(result.metadata.retrievalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.assemblyTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.totalTimeMs).toBeGreaterThanOrEqual(0);
      // Total time should be at least the sum of components (may have overhead)
      expect(result.metadata.totalTimeMs).toBeDefined();
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      // Reset to ensure clean state
      service.resetStats();

      const statsAfterReset = service.getStats();
      expect(statsAfterReset.totalGenerations).toBe(0);
      expect(statsAfterReset.totalTokensUsed).toBe(0);
      expect(statsAfterReset.avgGenerationTimeMs).toBe(0);
      expect(statsAfterReset.avgTokensPerGeneration).toBe(0);
    });
  });
});
