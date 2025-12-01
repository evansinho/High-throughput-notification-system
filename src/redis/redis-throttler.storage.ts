import { ThrottlerStorage, ThrottlerStorageRecord } from '@nestjs/throttler';
import { RedisService } from './redis.service';

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${key}`;
    const ttlMilliseconds = ttl * 1000;

    // Increment the counter
    const totalHits = await this.redisService.incr(redisKey);

    // Set expiration on first hit
    if (totalHits === 1) {
      await this.redisService.expire(redisKey, ttl);
    }

    // Get remaining TTL
    const remainingTtl = await this.redisService.ttl(redisKey);
    const timeToExpire =
      remainingTtl > 0 ? remainingTtl * 1000 : ttlMilliseconds;

    // Check if blocked
    const isBlocked = totalHits > limit;
    const timeToBlockExpire = isBlocked ? timeToExpire : 0;

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
