import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { CacheService } from './redis/cache.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('users')
  async getUsers() {
    // Using cache-aside pattern with CacheService
    const users = await this.cache.getOrSet(
      'users:all',
      async () => {
        return this.prisma.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        });
      },
      { ttl: 60, prefix: 'users' },
    );

    return users;
  }

  @Get('cache-test')
  async testCache() {
    const testKey = 'test:key';
    const testValue = { message: 'Hello from Redis!', timestamp: Date.now() };

    // Set value
    await this.redis.set(testKey, testValue, 30);

    // Get value
    const retrieved = await this.redis.get(testKey);

    // Get TTL
    const ttl = await this.redis.ttl(testKey);

    return {
      stored: testValue,
      retrieved,
      ttl,
      match: JSON.stringify(testValue) === JSON.stringify(retrieved),
    };
  }
}
