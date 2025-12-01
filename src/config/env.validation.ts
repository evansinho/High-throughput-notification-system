import * as Joi from 'joi';

/**
 * Environment validation schema using Joi
 * Ensures all required environment variables are set with correct types
 */
export const envValidationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  // Database
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),

  // Kafka
  KAFKA_BROKER: Joi.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: Joi.string().default('notification-service'),
  KAFKA_CONSUMER_GROUP: Joi.string().default('notification-workers'),

  // JWT
  JWT_SECRET: Joi.string().required().min(32),
  JWT_EXPIRATION: Joi.string().default('7d'),

  // External Services (optional for now)
  SENDGRID_API_KEY: Joi.string().optional().allow(''),
  TWILIO_ACCOUNT_SID: Joi.string().optional().allow(''),
  TWILIO_AUTH_TOKEN: Joi.string().optional().allow(''),
  TWILIO_PHONE_NUMBER: Joi.string().optional().allow(''),

  // Observability (optional for now)
  JAEGER_ENDPOINT: Joi.string().optional().allow(''),
  PROMETHEUS_PORT: Joi.number().optional(),

  // Feature Flags
  ENABLE_KAFKA_CONSUMER: Joi.boolean().default(true),
  ENABLE_RATE_LIMITING: Joi.boolean().default(true),
});
