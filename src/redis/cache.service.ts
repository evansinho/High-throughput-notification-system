import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CACHE_TTL } from '../common/constants';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Key prefix for namespacing
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTTL = CACHE_TTL.LONG;

  constructor(private readonly redis: RedisService) {}

  /**
   * Generate a cache key with optional prefix and version
   */
  private generateKey(key: string, options?: CacheOptions): string {
    const prefix = options?.prefix || 'cache';
    return `${prefix}:${key}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    try {
      const cacheKey = this.generateKey(key, options);
      return await this.redis.get<T>(cacheKey);
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(
    key: string,
    value: unknown,
    options?: CacheOptions,
  ): Promise<boolean> {
    try {
      const cacheKey = this.generateKey(key, options);
      const ttl = options?.ttl || this.defaultTTL;
      await this.redis.set(cacheKey, value, ttl);
      return true;
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete a specific cache key
   */
  async invalidate(key: string, options?: CacheOptions): Promise<boolean> {
    try {
      const cacheKey = this.generateKey(key, options);
      await this.redis.del(cacheKey);
      this.logger.log(`Cache invalidated for key: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`Cache invalidate error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Invalidate all keys matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      for (const key of keys) {
        await this.redis.del(key);
      }

      this.logger.log(
        `Cache invalidated ${keys.length} keys matching: ${pattern}`,
      );
      return keys.length;
    } catch (error) {
      this.logger.error(
        `Cache invalidate pattern error for ${pattern}:`,
        error,
      );
      return 0;
    }
  }

  /**
   * Cache-aside pattern: Get from cache or fetch and cache
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // If not in cache, fetch the data
    const data = await fetchFn();

    // Store in cache (fire and forget)
    this.set(key, data, options).catch((err) => {
      this.logger.error(`Failed to cache data for key ${key}:`, err);
    });

    return data;
  }

  /**
   * Versioned cache key strategy - increment version to invalidate
   */
  async incrementVersion(resource: string): Promise<number> {
    const versionKey = `version:${resource}`;
    return await this.redis.incr(versionKey);
  }

  /**
   * Get current version of a resource
   */
  async getVersion(resource: string): Promise<number> {
    const versionKey = `version:${resource}`;
    const version = await this.redis.get<number>(versionKey);
    return version || 1;
  }

  /**
   * Generate a versioned cache key
   */
  async getVersionedKey(resource: string, key: string): Promise<string> {
    const version = await this.getVersion(resource);
    return `${resource}:v${version}:${key}`;
  }

  /**
   * Write-through cache: Update both cache and source
   */
  async writeThrough<T>(
    key: string,
    value: T,
    updateFn: (value: T) => Promise<void>,
    options?: CacheOptions,
  ): Promise<void> {
    // Update the source first
    await updateFn(value);

    // Then update the cache
    await this.set(key, value, options);

    this.logger.log(`Write-through completed for key: ${key}`);
  }

  /**
   * Tag-based invalidation: Associate keys with tags for batch invalidation
   */
  async setWithTags(
    key: string,
    value: unknown,
    tags: string[],
    options?: CacheOptions,
  ): Promise<boolean> {
    const cacheKey = this.generateKey(key, options);

    // Store the main value
    await this.set(key, value, options);

    // Associate key with tags
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      await this.redis.getClient().sadd(tagKey, cacheKey);
    }

    return true;
  }

  /**
   * Invalidate all keys associated with a tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    try {
      const tagKey = `tag:${tag}`;
      const keys = await this.redis.getClient().smembers(tagKey);

      if (keys.length === 0) {
        return 0;
      }

      // Delete all keys
      for (const key of keys) {
        await this.redis.del(key);
      }

      // Clean up the tag set
      await this.redis.del(tagKey);

      this.logger.log(`Cache invalidated ${keys.length} keys for tag: ${tag}`);
      return keys.length;
    } catch (error) {
      this.logger.error(`Cache invalidate by tag error for ${tag}:`, error);
      return 0;
    }
  }
}
