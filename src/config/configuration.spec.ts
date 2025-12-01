import configuration from './configuration';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default configuration', () => {
    const config = configuration();

    expect(config).toBeDefined();
    expect(config.app).toBeDefined();
    expect(config.database).toBeDefined();
    expect(config.redis).toBeDefined();
    expect(config.kafka).toBeDefined();
    expect(config.jwt).toBeDefined();
  });

  it('should use environment variables when provided', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '4000';
    process.env.REDIS_HOST = 'redis.example.com';
    process.env.REDIS_PORT = '6380';

    const config = configuration();

    expect(config.app.nodeEnv).toBe('production');
    expect(config.app.port).toBe(4000);
    expect(config.app.isProduction).toBe(true);
    expect(config.redis.host).toBe('redis.example.com');
    expect(config.redis.port).toBe(6380);
  });

  it('should use default values when environment variables are not set', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.PORT;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;

    const config = configuration();

    expect(config.app.nodeEnv).toBe('development');
    expect(config.app.port).toBe(3000);
    expect(config.app.isDevelopment).toBe(true);
    expect(config.redis.host).toBe('localhost');
    expect(config.redis.port).toBe(6379);
  });

  it('should correctly identify environment', () => {
    process.env.NODE_ENV = 'test';
    let config = configuration();
    expect(config.app.isTest).toBe(true);
    expect(config.app.isProduction).toBe(false);
    expect(config.app.isDevelopment).toBe(false);

    process.env.NODE_ENV = 'production';
    config = configuration();
    expect(config.app.isProduction).toBe(true);
    expect(config.app.isTest).toBe(false);
    expect(config.app.isDevelopment).toBe(false);
  });

  it('should parse Kafka configuration', () => {
    process.env.KAFKA_BROKER = 'kafka.example.com:9093';
    process.env.KAFKA_CLIENT_ID = 'my-service';
    process.env.KAFKA_CONSUMER_GROUP = 'my-workers';

    const config = configuration();

    expect(config.kafka.broker).toBe('kafka.example.com:9093');
    expect(config.kafka.clientId).toBe('my-service');
    expect(config.kafka.consumerGroup).toBe('my-workers');
  });

  it('should parse feature flags', () => {
    process.env.ENABLE_KAFKA_CONSUMER = 'false';
    process.env.ENABLE_RATE_LIMITING = 'false';

    const config = configuration();

    expect(config.features.kafkaConsumerEnabled).toBe(false);
    expect(config.features.rateLimitingEnabled).toBe(false);
  });

  it('should default feature flags to true', () => {
    delete process.env.ENABLE_KAFKA_CONSUMER;
    delete process.env.ENABLE_RATE_LIMITING;

    const config = configuration();

    expect(config.features.kafkaConsumerEnabled).toBe(true);
    expect(config.features.rateLimitingEnabled).toBe(true);
  });
});
