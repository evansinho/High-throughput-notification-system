import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import * as crypto from 'crypto';

/**
 * Response Cache Service
 *
 * Caches LLM responses to reduce costs and improve latency:
 * - Redis-based caching with 24-hour TTL
 * - MD5 hash-based cache keys for prompt deduplication
 * - Automatic cache invalidation
 * - Cache hit/miss metrics
 * - Fallback to no-cache on Redis errors
 *
 * Benefits:
 * - Reduce duplicate API calls (cost savings)
 * - Improve response times for repeated queries
 * - Track cache effectiveness (hit rate)
 */
@Injectable()
export class ResponseCacheService implements OnModuleInit {
  private readonly logger = new Logger(ResponseCacheService.name);
  private redisClient: RedisClientType | null = null;
  private isConnected = false;

  // Cache statistics
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheErrors = 0;

  // Configuration
  private readonly CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
  private readonly CACHE_KEY_PREFIX = 'ai:response:';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

      this.redisClient = createClient({
        url: redisUrl,
      });

      this.redisClient.on('error', (err) => {
        this.logger.error(`Redis connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis client connected');
        this.isConnected = true;
      });

      this.redisClient.on('ready', () => {
        this.logger.log('Redis client ready');
        this.isConnected = true;
      });

      await this.redisClient.connect();
      this.logger.log('Response cache service initialized with Redis');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to initialize Redis for response cache: ${errorMessage}. Cache will be disabled.`,
      );
      this.redisClient = null;
      this.isConnected = false;
    }
  }

  /**
   * Get cached response for a prompt
   * Returns null if not found or cache disabled
   */
  async get(prompt: string, context?: any): Promise<CachedResponse | null> {
    if (!this.isConnected || !this.redisClient) {
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(prompt, context);
      const cachedData = await this.redisClient.get(cacheKey);

      if (cachedData) {
        this.cacheHits++;
        const cached = JSON.parse(cachedData) as CachedResponse;

        this.logger.debug(
          `Cache HIT for key ${cacheKey.substring(0, 20)}... (saved $${cached.cost.toFixed(4)}, ${cached.tokensUsed} tokens)`,
        );

        return cached;
      }

      this.cacheMisses++;
      this.logger.debug(`Cache MISS for key ${cacheKey.substring(0, 20)}...`);
      return null;
    } catch (error) {
      this.cacheErrors++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Cache get error: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Store response in cache
   */
  async set(
    prompt: string,
    response: string,
    metadata: {
      tokensUsed: number;
      cost: number;
      model: string;
      latencyMs: number;
    },
    context?: any,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(prompt, context);
      const cachedResponse: CachedResponse = {
        prompt,
        response,
        tokensUsed: metadata.tokensUsed,
        cost: metadata.cost,
        model: metadata.model,
        latencyMs: metadata.latencyMs,
        cachedAt: new Date().toISOString(),
      };

      const ttl = ttlSeconds ?? this.CACHE_TTL_SECONDS;
      await this.redisClient.setEx(cacheKey, ttl, JSON.stringify(cachedResponse));

      this.logger.debug(
        `Cached response for key ${cacheKey.substring(0, 20)}... (TTL: ${ttl}s, ${metadata.tokensUsed} tokens, $${metadata.cost.toFixed(4)})`,
      );
    } catch (error) {
      this.cacheErrors++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Cache set error: ${errorMessage}`);
    }
  }

  /**
   * Generate cache key from prompt and optional context
   * Uses MD5 hash for consistent key generation
   */
  private generateCacheKey(prompt: string, context?: any): string {
    const normalizedPrompt = prompt.trim().toLowerCase();
    const contextStr = context ? JSON.stringify(context) : '';
    const combinedInput = `${normalizedPrompt}${contextStr}`;

    const hash = crypto.createHash('md5').update(combinedInput).digest('hex');
    return `${this.CACHE_KEY_PREFIX}${hash}`;
  }

  /**
   * Invalidate specific cache entry
   */
  async invalidate(prompt: string, context?: any): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(prompt, context);
      await this.redisClient.del(cacheKey);
      this.logger.debug(`Invalidated cache for key ${cacheKey.substring(0, 20)}...`);
    } catch (error) {
      this.cacheErrors++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Cache invalidate error: ${errorMessage}`);
    }
  }

  /**
   * Clear all AI response caches
   */
  async clearAll(): Promise<number> {
    if (!this.isConnected || !this.redisClient) {
      return 0;
    }

    try {
      // Use SCAN to find all keys with our prefix
      const keys: string[] = [];
      let cursor = 0;

      do {
        const result = await this.redisClient.scan(cursor, {
          MATCH: `${this.CACHE_KEY_PREFIX}*`,
          COUNT: 100,
        });

        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);

      if (keys.length > 0) {
        await this.redisClient.del(keys);
        this.logger.log(`Cleared ${keys.length} cached responses`);
      }

      return keys.length;
    } catch (error) {
      this.cacheErrors++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Cache clear error: ${errorMessage}`);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.cacheHits + this.cacheMisses;
    const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;

    return {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheErrors: this.cacheErrors,
      totalRequests,
      hitRate,
      isConnected: this.isConnected,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheErrors = 0;
    this.logger.log('Cache statistics reset');
  }

  /**
   * Check if cache is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.redisClient !== null;
  }

  /**
   * Get cache size (approximate)
   * Returns number of cached responses
   */
  async getCacheSize(): Promise<number> {
    if (!this.isConnected || !this.redisClient) {
      return 0;
    }

    try {
      let count = 0;
      let cursor = 0;

      do {
        const result = await this.redisClient.scan(cursor, {
          MATCH: `${this.CACHE_KEY_PREFIX}*`,
          COUNT: 100,
        });

        cursor = result.cursor;
        count += result.keys.length;
      } while (cursor !== 0);

      return count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting cache size: ${errorMessage}`);
      return 0;
    }
  }

  /**
   * Calculate cost savings from cache
   * Estimates savings based on cache hits
   */
  async getCostSavings(): Promise<CostSavings> {
    if (!this.isConnected || !this.redisClient) {
      return {
        totalSavedCost: 0,
        totalSavedTokens: 0,
        totalSavedRequests: this.cacheHits,
        estimatedSavingsPercent: 0,
      };
    }

    try {
      // Sample some cached responses to calculate average cost
      let totalCost = 0;
      let totalTokens = 0;
      let sampleCount = 0;
      let cursor = 0;

      do {
        const result = await this.redisClient.scan(cursor, {
          MATCH: `${this.CACHE_KEY_PREFIX}*`,
          COUNT: 10, // Sample 10 at a time
        });

        cursor = result.cursor;

        for (const key of result.keys) {
          if (sampleCount >= 50) break; // Limit sample size

          const cachedData = await this.redisClient.get(key);
          if (cachedData) {
            const cached = JSON.parse(cachedData) as CachedResponse;
            totalCost += cached.cost;
            totalTokens += cached.tokensUsed;
            sampleCount++;
          }
        }
      } while (cursor !== 0 && sampleCount < 50);

      const avgCostPerRequest = sampleCount > 0 ? totalCost / sampleCount : 0;
      const avgTokensPerRequest = sampleCount > 0 ? totalTokens / sampleCount : 0;

      const totalSavedCost = this.cacheHits * avgCostPerRequest;
      const totalSavedTokens = this.cacheHits * avgTokensPerRequest;

      const totalRequests = this.cacheHits + this.cacheMisses;
      const estimatedSavingsPercent =
        totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;

      return {
        totalSavedCost,
        totalSavedTokens,
        totalSavedRequests: this.cacheHits,
        estimatedSavingsPercent,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error calculating cost savings: ${errorMessage}`);
      return {
        totalSavedCost: 0,
        totalSavedTokens: 0,
        totalSavedRequests: this.cacheHits,
        estimatedSavingsPercent: 0,
      };
    }
  }

  /**
   * Clean up on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.logger.log('Redis client disconnected');
    }
  }
}

/**
 * Cached Response
 */
export interface CachedResponse {
  prompt: string;
  response: string;
  tokensUsed: number;
  cost: number;
  model: string;
  latencyMs: number;
  cachedAt: string;
}

/**
 * Cache Statistics
 */
export interface CacheStats {
  cacheHits: number;
  cacheMisses: number;
  cacheErrors: number;
  totalRequests: number;
  hitRate: number;
  isConnected: boolean;
}

/**
 * Cost Savings from Cache
 */
export interface CostSavings {
  totalSavedCost: number;
  totalSavedTokens: number;
  totalSavedRequests: number;
  estimatedSavingsPercent: number;
}