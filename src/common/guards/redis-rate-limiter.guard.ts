import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

/**
 * Token Bucket Rate Limiter using Redis
 *
 * Algorithm:
 * - Each user has a bucket with a maximum number of tokens
 * - Tokens are consumed with each request
 * - Tokens refill at a constant rate
 * - If no tokens available, request is rejected
 */
@Injectable()
export class RedisRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(RedisRateLimiterGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Skip rate limiting for non-authenticated requests (handled by global throttler)
    if (!user) {
      return true;
    }

    const userId = user.id || user.sub;
    const endpoint = `${request.method}:${request.route.path}`;

    // Token bucket parameters
    const maxTokens = 100; // Maximum tokens in bucket
    const refillRate = 100; // Tokens per minute
    const refillInterval = 60; // seconds
    const tokensPerRequest = 1;

    const key = `rate_limit:${userId}:${endpoint}`;
    const now = Date.now();

    try {
      // Get current bucket state from Redis
      const bucketData = await this.redis.get<{
        tokens: number;
        lastRefill: number;
      }>(key);
      let bucket: { tokens: number; lastRefill: number };

      if (bucketData) {
        bucket = bucketData;
      } else {
        // Initialize new bucket
        bucket = {
          tokens: maxTokens,
          lastRefill: now,
        };
      }

      // Calculate tokens to add based on time elapsed
      const timeElapsed = (now - bucket.lastRefill) / 1000; // seconds
      const tokensToAdd = Math.floor(
        (timeElapsed / refillInterval) * refillRate,
      );

      // Refill tokens (up to max)
      bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;

      // Check if enough tokens available
      if (bucket.tokens < tokensPerRequest) {
        // Calculate retry-after time
        const tokensNeeded = tokensPerRequest - bucket.tokens;
        const retryAfter = Math.ceil(
          (tokensNeeded / refillRate) * refillInterval,
        );

        this.logger.warn(
          `Rate limit exceeded for user ${userId} on ${endpoint}`,
        );

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please try again later.',
            retryAfter: retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Consume tokens
      bucket.tokens -= tokensPerRequest;

      // Save bucket state to Redis with TTL
      await this.redis.set(
        key,
        bucket,
        refillInterval * 2, // TTL: 2x refill interval
      );

      // Add rate limit headers
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-RateLimit-Limit', maxTokens.toString());
      response.setHeader(
        'X-RateLimit-Remaining',
        Math.floor(bucket.tokens).toString(),
      );
      response.setHeader(
        'X-RateLimit-Reset',
        new Date(bucket.lastRefill + refillInterval * 1000).toISOString(),
      );

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // Log error but don't block request if Redis fails
      this.logger.error('Rate limiter error:', error);
      return true;
    }
  }
}
