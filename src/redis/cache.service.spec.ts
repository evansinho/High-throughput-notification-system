import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

describe('CacheService', () => {
  let cacheService: CacheService;

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    incr: jest.fn(),
    getClient: jest.fn(() => ({
      sadd: jest.fn(),
      smembers: jest.fn(),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    cacheService = module.get<CacheService>(CacheService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(cacheService).toBeDefined();
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockRedisService.get.mockResolvedValue(mockData);

      const result = await cacheService.get('test-key');

      expect(result).toEqual(mockData);
      expect(mockRedisService.get).toHaveBeenCalledWith('cache:test-key');
    });

    it('should return null if key does not exist', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await cacheService.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in cache with TTL', async () => {
      mockRedisService.set.mockResolvedValue('OK');

      const result = await cacheService.set(
        'test-key',
        { data: 'test' },
        {
          ttl: 60,
        },
      );

      expect(result).toBe(true);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'cache:test-key',
        { data: 'test' },
        60,
      );
    });

    it('should use default TTL if not provided', async () => {
      mockRedisService.set.mockResolvedValue('OK');

      await cacheService.set('test-key', { data: 'test' });

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'cache:test-key',
        { data: 'test' },
        3600, // Default TTL
      );
    });

    it('should return false on error', async () => {
      mockRedisService.set.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.set('test-key', { data: 'test' });

      expect(result).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should delete key from cache', async () => {
      mockRedisService.del.mockResolvedValue(1);

      const result = await cacheService.invalidate('test-key');

      expect(result).toBe(true);
      expect(mockRedisService.del).toHaveBeenCalledWith('cache:test-key');
    });

    it('should return false on error', async () => {
      mockRedisService.del.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.invalidate('test-key');

      expect(result).toBe(false);
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const cachedData = { id: 1, name: 'Cached' };
      mockRedisService.get.mockResolvedValue(cachedData);

      const fetchFn = jest.fn();
      const result = await cacheService.getOrSet('test-key', fetchFn);

      expect(result).toEqual(cachedData);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not exists', async () => {
      const freshData = { id: 2, name: 'Fresh' };
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.set.mockResolvedValue('OK');

      const fetchFn = jest.fn().mockResolvedValue(freshData);
      const result = await cacheService.getOrSet('test-key', fetchFn);

      expect(result).toEqual(freshData);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('incrementVersion', () => {
    it('should increment version counter', async () => {
      mockRedisService.incr.mockResolvedValue(2);

      const result = await cacheService.incrementVersion('users');

      expect(result).toBe(2);
      expect(mockRedisService.incr).toHaveBeenCalledWith('version:users');
    });
  });

  describe('invalidatePattern', () => {
    it('should invalidate all keys matching pattern', async () => {
      mockRedisService.keys.mockResolvedValue(['cache:user:1', 'cache:user:2']);
      mockRedisService.del.mockResolvedValue(1);

      const result = await cacheService.invalidatePattern('cache:user:*');

      expect(result).toBe(2);
      expect(mockRedisService.del).toHaveBeenCalledTimes(2);
    });

    it('should return 0 if no keys match', async () => {
      mockRedisService.keys.mockResolvedValue([]);

      const result = await cacheService.invalidatePattern('cache:user:*');

      expect(result).toBe(0);
      expect(mockRedisService.del).not.toHaveBeenCalled();
    });
  });
});
