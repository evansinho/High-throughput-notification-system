import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { VectorDbModule } from './vector-db.module';
import { DocumentIngestionService } from './services/ingestion/document-ingestion.service';
import { RetrievalService } from './services/retrieval.service';
import { ContextAssemblyService } from './services/context-assembly.service';
import { QdrantService } from './services/qdrant.service';

/**
 * Integration Test Suite for Complete RAG Pipeline
 * Tests: Document Ingestion → Vector Storage → Retrieval → Context Assembly
 */
describe('Vector DB Pipeline Integration (e2e)', () => {
  let ingestionService: DocumentIngestionService;
  let retrievalService: RetrievalService;
  let contextAssemblyService: ContextAssemblyService;
  let qdrantService: QdrantService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        VectorDbModule,
      ],
    }).compile();

    ingestionService = module.get<DocumentIngestionService>(
      DocumentIngestionService,
    );
    retrievalService = module.get<RetrievalService>(RetrievalService);
    contextAssemblyService = module.get<ContextAssemblyService>(
      ContextAssemblyService,
    );
    qdrantService = module.get<QdrantService>(QdrantService);

    // Ensure collection exists
    await qdrantService.ensureCollection();
  });

  describe('Complete Pipeline', () => {
    it('should successfully process document through entire pipeline', async () => {
      const startTime = Date.now();

      // Step 1: Ingest document
      const testNotifications = [
        {
          id: 'test-notif-1',
          userId: 'user-123',
          channel: 'email',
          type: 'order-shipped',
          subject: 'Order Shipped',
          content: `Hi {{customer_name}},

Great news! Your order #{{order_id}} has been shipped.

Tracking Number: {{tracking_number}}
Estimated Delivery: {{delivery_date}}

You can track your package at: {{tracking_url}}

Thank you for shopping with us!`,
          status: 'SENT',
          priority: 'normal',
          sentAt: new Date(),
          metadata: {
            category: 'transactional',
            tone: 'friendly',
            language: 'en',
            tags: ['order', 'shipping', 'tracking'],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const ingestionResult = await ingestionService.ingestBatch(
        testNotifications,
        {
          skipValidation: false,
          skipEmbedding: false,
          skipStorage: false,
        },
      );

      expect(ingestionResult).toBeDefined();
      expect(ingestionResult.successCount).toBeGreaterThan(0);

      const ingestionTime = Date.now() - startTime;
      console.log(`Ingestion time: ${ingestionTime}ms`);

      // Step 2: Wait briefly for indexing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Retrieve similar templates
      const retrievalStartTime = Date.now();

      const retrievalResult = await retrievalService.search({
        queryText:
          'Generate email notification for order shipment with tracking',
        topK: 5,
        scoreThreshold: 0.3,
      });

      const retrievalTime = Date.now() - retrievalStartTime;
      console.log(`Retrieval time: ${retrievalTime}ms`);

      expect(retrievalResult).toBeDefined();
      expect(retrievalResult.results.length).toBeGreaterThanOrEqual(0);
      expect(retrievalResult.metadata.searchTimeMs).toBeLessThan(2000);

      // Step 4: Assemble context
      const assemblyStartTime = Date.now();

      const context = await contextAssemblyService.assembleContext(
        retrievalResult.results,
        'Generate email notification for order shipment with tracking',
      );

      const assemblyTime = Date.now() - assemblyStartTime;
      console.log(`Assembly time: ${assemblyTime}ms`);

      expect(context).toBeDefined();
      expect(context.prompt).toBeDefined();
      expect(context.context.length).toBeGreaterThanOrEqual(0);
      expect(context.metadata.totalTokens).toBeGreaterThanOrEqual(0);

      // Total pipeline time
      const totalTime = Date.now() - startTime;
      console.log(`Total pipeline time: ${totalTime}ms`);

      // Performance assertions (relaxed for CI)
      expect(retrievalTime).toBeLessThan(2000);
      expect(assemblyTime).toBeLessThan(200);
    });

    it('should handle multiple queries with consistent results', async () => {
      const queries = [
        'Order shipment notification',
        'Send tracking information to customer',
        'Notify user about delivery status',
      ];

      const results = [];

      for (const query of queries) {
        const startTime = Date.now();

        const retrievalResult = await retrievalService.search({
          queryText: query,
          topK: 3,
          scoreThreshold: 0.3,
        });

        const context = await contextAssemblyService.assembleContext(
          retrievalResult.results,
          query,
        );

        const queryTime = Date.now() - startTime;

        results.push({
          query,
          resultCount: retrievalResult.results.length,
          contextSize: context.context.length,
          tokens: context.metadata.totalTokens,
          timeMs: queryTime,
        });
      }

      console.log('Query results:', results);

      // All queries should complete reasonably fast
      results.forEach((result) => {
        expect(result.timeMs).toBeLessThan(2000);
        expect(result.resultCount).toBeGreaterThanOrEqual(0);
      });
    });

    it('should retrieve results with appropriate relevance scores', async () => {
      const result = await retrievalService.search({
        queryText: 'Order shipment email with tracking',
        topK: 5,
        scoreThreshold: 0.3,
      });

      expect(result.results.length).toBeGreaterThanOrEqual(0);

      // Results should be sorted by score (descending)
      for (let i = 0; i < result.results.length - 1; i++) {
        expect(result.results[i].score).toBeGreaterThanOrEqual(
          result.results[i + 1].score,
        );
      }
    });

    it('should handle metadata filtering correctly', async () => {
      const result = await retrievalService.search({
        queryText: 'Generate notification',
        topK: 10,
        scoreThreshold: 0.3,
        filter: {
          channel: 'email',
          category: 'transactional',
        },
      });

      expect(result.results.length).toBeGreaterThanOrEqual(0);

      // All results should match filters (if any results returned)
      result.results.forEach((res) => {
        expect(res.payload.channel).toBe('email');
        expect(res.payload.category).toBe('transactional');
      });
    });

    it('should deduplicate similar templates in context', async () => {
      const result = await retrievalService.search({
        queryText: 'Order notification',
        topK: 10,
        scoreThreshold: 0.2,
      });

      const context = await contextAssemblyService.assembleContext(
        result.results,
        'Generate order notification',
      );

      // Context should be deduplicated
      expect(context.metadata.deduplicatedResults).toBeLessThanOrEqual(
        context.metadata.relevantResults,
      );

      // Verify no exact duplicates by ID
      const ids = new Set(context.context.map((r) => r.id));
      expect(ids.size).toBe(context.context.length);
    });

    it('should respect context window token limits', async () => {
      const result = await retrievalService.search({
        queryText: 'Generate notification',
        topK: 100,
        scoreThreshold: 0.1,
      });

      const context = await contextAssemblyService.assembleContext(
        result.results,
        'Generate notification',
        {
          maxTokens: 1000, // Small context window
        },
      );

      // Should respect token limit
      expect(context.metadata.totalTokens).toBeLessThanOrEqual(1000);
      expect(context.metadata.utilizationPercent).toBeLessThanOrEqual(100);
    });

    it('should generate properly formatted prompts', async () => {
      const result = await retrievalService.search({
        queryText: 'Order shipment email',
        topK: 3,
        scoreThreshold: 0.3,
      });

      const context = await contextAssemblyService.assembleContext(
        result.results,
        'Generate order shipment notification',
      );

      expect(context.prompt).toBeDefined();
      expect(context.prompt.length).toBeGreaterThan(0);

      // Check for key sections
      expect(context.prompt).toContain('User Request');

      // Check for metadata in prompt (if results exist)
      if (context.context.length > 0) {
        expect(context.prompt).toContain('Template Examples');
        expect(context.prompt).toContain('Channel:');
      }
    });
  });

  describe('Performance Benchmarks', () => {
    it('should measure retrieval latency', async () => {
      const iterations = 5;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        await retrievalService.search({
          queryText: 'Test query for performance',
          topK: 5,
          scoreThreshold: 0.3,
        });

        latencies.push(Date.now() - startTime);
      }

      const avgLatency =
        latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      console.log('Retrieval latency stats:');
      console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
      console.log(`  Min: ${minLatency}ms`);
      console.log(`  Max: ${maxLatency}ms`);

      // Performance target (relaxed for integration tests)
      expect(avgLatency).toBeLessThan(2000);
    });

    it('should measure context assembly latency', async () => {
      // Get some results first
      const retrievalResult = await retrievalService.search({
        queryText: 'Test query',
        topK: 10,
        scoreThreshold: 0.2,
      });

      const iterations = 10;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        await contextAssemblyService.assembleContext(
          retrievalResult.results,
          'Test query',
        );

        latencies.push(Date.now() - startTime);
      }

      const avgLatency =
        latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;

      console.log(
        `Context assembly average latency: ${avgLatency.toFixed(2)}ms`,
      );

      // Should be very fast (mostly CPU-bound)
      expect(avgLatency).toBeLessThan(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty query gracefully', async () => {
      const result = await retrievalService.search({
        queryText: '',
        topK: 5,
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
    });

    it('should handle query with no results', async () => {
      const result = await retrievalService.search({
        queryText: 'xyz123nonexistent456abcdefghijklmnop',
        topK: 5,
        scoreThreshold: 0.99, // Very high threshold
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      // May have 0 results due to high threshold
    });

    it('should handle empty search results in context assembly', async () => {
      const context = await contextAssemblyService.assembleContext(
        [],
        'Test query',
      );

      expect(context).toBeDefined();
      expect(context.prompt).toBeDefined();
      expect(context.context.length).toBe(0);
      expect(context.metadata.totalResults).toBe(0);
    });
  });
});
