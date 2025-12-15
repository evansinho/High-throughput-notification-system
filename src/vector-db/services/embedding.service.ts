import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmbeddingResult,
  EmbeddingBatchResult,
  EmbeddingStats,
} from '../interfaces/vector.interface';
import { CacheService } from '../../redis/cache.service';
import OpenAI from 'openai';

/**
 * Embedding Service - Generates vector embeddings for text
 *
 * Features:
 * - OpenAI API integration with text-embedding-3-small (512 dimensions)
 * - Batch processing (configurable batch size, default 100)
 * - Redis caching (cache embeddings by text hash)
 * - Retry logic with exponential backoff
 * - Cost monitoring ($0.02 per 1M tokens)
 * - Fallback to mock embeddings in test/dev mode
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly vectorSize = 512; // text-embedding-3-small dimensions
  private readonly model = 'text-embedding-3-small';
  private readonly batchSize = 100;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  // Cost tracking
  private totalTokensProcessed = 0;
  private totalCost = 0;
  private readonly costPerMillionTokens = 0.02; // $0.02 per 1M tokens

  private openai: OpenAI | null = null;
  private useMockEmbeddings = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    const env = this.configService.get('app.nodeEnv');

    if (openaiApiKey && env === 'production') {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
      this.useMockEmbeddings = false;
      this.logger.log(
        `Embedding Service initialized with OpenAI (${this.model})`,
      );
    } else {
      this.useMockEmbeddings = true;
      this.logger.log('Embedding Service initialized (mock mode)');
    }

    this.logger.log(`Environment: ${env}`);
    this.logger.log(`Vector size: ${this.vectorSize}`);
    this.logger.log(`Batch size: ${this.batchSize}`);
  }

  /**
   * Generate embedding for text with caching and retry logic
   */
  async generateEmbedding(
    text: string,
    useCache = true,
  ): Promise<EmbeddingResult> {
    try {
      // Check cache first
      if (useCache) {
        const cacheKey = this.getCacheKey(text);
        const cached = await this.cacheService.get<number[]>(cacheKey);
        if (cached) {
          this.logger.debug('Cache hit for embedding');
          return {
            embedding: cached,
            model: this.model,
            dimensions: this.vectorSize,
            cached: true,
          };
        }
      }

      // Generate embedding
      let embedding: number[];
      if (this.useMockEmbeddings) {
        embedding = this.mockEmbedding(text);
      } else {
        embedding = await this.generateOpenAIEmbedding(text);
      }

      // Cache the result
      if (useCache) {
        const cacheKey = this.getCacheKey(text);
        // Cache for 7 days (embeddings don't change)
        await this.cacheService.set(cacheKey, embedding, {
          ttl: 7 * 24 * 60 * 60,
        });
      }

      return {
        embedding,
        model: this.model,
        dimensions: this.vectorSize,
        cached: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to generate embedding: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Batch generate embeddings for multiple texts
   * Processes in chunks of batchSize (default 100) for efficiency
   */
  async generateEmbeddings(
    texts: string[],
    useCache = true,
  ): Promise<EmbeddingBatchResult> {
    const startTime = Date.now();
    const results: EmbeddingResult[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    try {
      // Process in batches
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize);
        this.logger.log(
          `Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(texts.length / this.batchSize)} (${batch.length} texts)`,
        );

        const batchResults = await this.processBatch(batch, useCache);
        results.push(...batchResults);

        // Count cache hits/misses
        batchResults.forEach((result) => {
          if (result.cached) {
            cacheHits++;
          } else {
            cacheMisses++;
          }
        });
      }

      const processingTimeMs = Date.now() - startTime;

      this.logger.log(
        `Batch embedding complete: ${texts.length} texts, ${cacheHits} cache hits, ${cacheMisses} cache misses, ${processingTimeMs}ms`,
      );

      return {
        results,
        totalTexts: texts.length,
        cacheHits,
        cacheMisses,
        processingTimeMs,
        stats: this.getStats(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to generate batch embeddings: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Process a single batch of texts (max batchSize)
   */
  private async processBatch(
    texts: string[],
    useCache: boolean,
  ): Promise<EmbeddingResult[]> {
    if (this.useMockEmbeddings) {
      // For mock embeddings, process one by one
      return Promise.all(
        texts.map((text) => this.generateEmbedding(text, useCache)),
      );
    }

    // For OpenAI, check cache first for all texts
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];
    const results: EmbeddingResult[] = new Array(texts.length);

    if (useCache) {
      for (let i = 0; i < texts.length; i++) {
        const cacheKey = this.getCacheKey(texts[i]);
        const cached = await this.cacheService.get<number[]>(cacheKey);
        if (cached) {
          results[i] = {
            embedding: cached,
            model: this.model,
            dimensions: this.vectorSize,
            cached: true,
          };
        } else {
          uncachedTexts.push(texts[i]);
          uncachedIndices.push(i);
        }
      }
    } else {
      uncachedTexts.push(...texts);
      uncachedIndices.push(...texts.map((_, i) => i));
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const embeddings =
        await this.generateOpenAIEmbeddingsBatch(uncachedTexts);

      // Fill results and cache
      for (let i = 0; i < uncachedTexts.length; i++) {
        const idx = uncachedIndices[i];
        results[idx] = {
          embedding: embeddings[i],
          model: this.model,
          dimensions: this.vectorSize,
          cached: false,
        };

        // Cache the result
        if (useCache) {
          const cacheKey = this.getCacheKey(uncachedTexts[i]);
          await this.cacheService.set(cacheKey, embeddings[i], {
            ttl: 7 * 24 * 60 * 60,
          });
        }
      }
    }

    return results;
  }

  /**
   * Generate OpenAI embedding with retry logic
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    return this.retryWithBackoff(async () => {
      if (!this.openai) {
        throw new Error('OpenAI client not initialized');
      }

      const response = await this.openai.embeddings.create({
        input: text,
        model: this.model,
        dimensions: this.vectorSize,
      });

      // Track usage
      this.totalTokensProcessed += response.usage.total_tokens;
      this.totalCost +=
        (response.usage.total_tokens / 1_000_000) * this.costPerMillionTokens;

      return response.data[0].embedding;
    });
  }

  /**
   * Generate OpenAI embeddings for batch
   */
  private async generateOpenAIEmbeddingsBatch(
    texts: string[],
  ): Promise<number[][]> {
    return this.retryWithBackoff(async () => {
      if (!this.openai) {
        throw new Error('OpenAI client not initialized');
      }

      const response = await this.openai.embeddings.create({
        input: texts,
        model: this.model,
        dimensions: this.vectorSize,
      });

      // Track usage
      this.totalTokensProcessed += response.usage.total_tokens;
      this.totalCost +=
        (response.usage.total_tokens / 1_000_000) * this.costPerMillionTokens;

      return response.data.map((item) => item.embedding);
    });
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempt = 1,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * delay * 0.1; // 10% jitter

      this.logger.warn(
        `Retry attempt ${attempt}/${this.maxRetries} after ${Math.round(delay + jitter)}ms`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      return this.retryWithBackoff(fn, attempt + 1);
    }
  }

  /**
   * Get cache key for text
   */
  private getCacheKey(text: string): string {
    const hash = this.simpleHash(text);
    return `embedding:${this.model}:${hash}`;
  }

  /**
   * Get embedding statistics
   */
  getStats(): EmbeddingStats {
    return {
      totalTokensProcessed: this.totalTokensProcessed,
      totalCost: this.totalCost,
      model: this.model,
      dimensions: this.vectorSize,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalTokensProcessed = 0;
    this.totalCost = 0;
    this.logger.log('Embedding statistics reset');
  }

  /**
   * MOCK: Generate deterministic embedding based on text content
   * This is for demo/testing purposes only
   *
   * Real embeddings would be generated by trained neural networks
   */
  private mockEmbedding(text: string): number[] {
    // Simple hash-based deterministic vector
    // In real implementation, this would be a neural network
    const hash = this.simpleHash(text);
    const embedding = new Array(this.vectorSize);

    // Generate pseudo-random but deterministic values
    for (let i = 0; i < this.vectorSize; i++) {
      const seed = hash + i;
      // Simple linear congruential generator
      const value = ((seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      // Normalize to [-1, 1]
      embedding[i] = value * 2 - 1;
    }

    // Normalize to unit vector (L2 norm = 1)
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

    return embedding.map((val) => val / norm);
  }

  /**
   * Simple string hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.vectorSize;
  }

  /**
   * Get model information
   */
  getModelInfo(): { name: string; dimensions: number } {
    return {
      name: this.model,
      dimensions: this.vectorSize,
    };
  }
}

/**
 * PRODUCTION IMPLEMENTATION NOTES:
 *
 * Option 1: OpenAI Embeddings
 * ```typescript
 * import { OpenAI } from 'openai';
 *
 * const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 * const response = await openai.embeddings.create({
 *   input: text,
 *   model: 'text-embedding-ada-002', // 1536 dimensions, $0.10 per 1M tokens
 *   // or 'text-embedding-3-small' // 1536 dimensions, $0.02 per 1M tokens
 * });
 * return response.data[0].embedding;
 * ```
 *
 * Option 2: Voyage AI (Anthropic recommended)
 * ```typescript
 * import { VoyageAIClient } from '@voyageai/voyage';
 *
 * const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
 * const response = await voyage.embed({
 *   texts: [text],
 *   model: 'voyage-2', // 1024 dimensions
 * });
 * return response.embeddings[0];
 * ```
 *
 * Option 3: Local Model (no API costs, but slower)
 * ```typescript
 * import { pipeline } from '@xenova/transformers';
 *
 * const extractor = await pipeline('feature-extraction',
 *   'Xenova/all-MiniLM-L6-v2'); // 384 dimensions
 * const output = await extractor(text, { pooling: 'mean', normalize: true });
 * return Array.from(output.data);
 * ```
 */
