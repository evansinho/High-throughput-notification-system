/**
 * Application configuration factory
 * Loads and structures environment variables for easy access
 */
export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  kafka: {
    broker: process.env.KAFKA_BROKER || 'localhost:9092',
    clientId: process.env.KAFKA_CLIENT_ID || 'notification-service',
    consumerGroup: process.env.KAFKA_CONSUMER_GROUP || 'notification-workers',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRATION || '7d',
  },

  external: {
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
  },

  ai: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096', 10),
      temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.7'),
    },
  },

  observability: {
    jaeger: {
      endpoint: process.env.JAEGER_ENDPOINT,
    },
    prometheus: {
      port: parseInt(process.env.PROMETHEUS_PORT || '9090', 10),
    },
  },

  features: {
    kafkaConsumerEnabled:
      process.env.ENABLE_KAFKA_CONSUMER === 'true' ||
      process.env.ENABLE_KAFKA_CONSUMER === undefined,
    rateLimitingEnabled:
      process.env.ENABLE_RATE_LIMITING === 'true' ||
      process.env.ENABLE_RATE_LIMITING === undefined,
  },
});
