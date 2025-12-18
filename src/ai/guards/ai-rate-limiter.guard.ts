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
 * AI Rate Limiter - 10 requests per minute for AI endpoints
 *
 * More restrictive than general rate limiter due to:
 * - High computational cost (LLM calls)
 * - Expensive API calls ($0.003-0.015 per request)
 * - Prevent abuse and cost overruns
 *
 * Algorithm: Token Bucket with Redis
 */
@Injectable()
export class AIRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(AIRateLimiterGuard.name);

  // AI-specific rate limits (more restrictive)
  private readonly maxTokens = 10; // 10 requests per bucket
  private readonly refillRate = 10; // 10 tokens per minute
  private readonly refillInterval = 60; // 60 seconds
  private readonly tokensPerRequest = 1;

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Require authentication for AI endpoints
    if (!user) {
      throw new HttpException(
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userId = user.id || user.sub;
    const endpoint = 'ai:generate';
    const key = `rate_limit:ai:${userId}:${endpoint}`;
    const now = Date.now();

    try {
      // Get current bucket state
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
          tokens: this.maxTokens,
          lastRefill: now,
        };
      }

      // Calculate tokens to add based on time elapsed
      const timeElapsed = (now - bucket.lastRefill) / 1000; // seconds
      const tokensToAdd = Math.floor(
        (timeElapsed / this.refillInterval) * this.refillRate,
      );

      // Refill tokens (up to max)
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;

      // Check if enough tokens available
      if (bucket.tokens < this.tokensPerRequest) {
        // Calculate retry-after time
        const tokensNeeded = this.tokensPerRequest - bucket.tokens;
        const retryAfter = Math.ceil(
          (tokensNeeded / this.refillRate) * this.refillInterval,
        );

        this.logger.warn(
          `AI rate limit exceeded for user ${userId} (${Math.floor(bucket.tokens)} tokens remaining)`,
        );

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message:
              'AI generation rate limit exceeded. You can make 10 requests per minute.',
            retryAfter: retryAfter,
            limit: this.maxTokens,
            remaining: 0,
            resetAt: new Date(
              bucket.lastRefill + this.refillInterval * 1000,
            ).toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Consume tokens
      bucket.tokens -= this.tokensPerRequest;

      // Save bucket state to Redis with TTL
      await this.redis.set(
        key,
        bucket,
        this.refillInterval * 2, // TTL: 2x refill interval
      );

      // Add rate limit headers
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-RateLimit-Limit', this.maxTokens.toString());
      response.setHeader(
        'X-RateLimit-Remaining',
        Math.floor(bucket.tokens).toString(),
      );
      response.setHeader(
        'X-RateLimit-Reset',
        new Date(
          bucket.lastRefill + this.refillInterval * 1000,
        ).toISOString(),
      );

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // Log error but don't block request if Redis fails (fail open)
      this.logger.error('AI rate limiter error:', error);
      return true;
    }
  }
}
