/**
 * Application-wide constants
 * Centralized location for magic numbers and configuration values
 */

// Cache TTL values (in seconds)
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

// Rate limiting configuration
export const RATE_LIMIT = {
  SHORT: {
    TTL: 1000, // 1 second
    LIMIT: 3,
  },
  MEDIUM: {
    TTL: 10000, // 10 seconds
    LIMIT: 20,
  },
  LONG: {
    TTL: 60000, // 1 minute
    LIMIT: 100,
  },
} as const;

// Kafka topics
export const KAFKA_TOPICS = {
  NOTIFICATIONS: 'notifications',
  DEAD_LETTER_QUEUE: 'notifications-dlq',
  RETRY_QUEUE: 'notifications-retry',
  EVENTS: 'events',
} as const;

// JWT configuration
export const JWT_CONFIG = {
  DEFAULT_EXPIRATION: '7d',
  REFRESH_EXPIRATION: '30d',
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

// HTTP status messages
export const HTTP_MESSAGES = {
  SUCCESS: 'Success',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  NOT_FOUND: 'Resource not found',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden',
  BAD_REQUEST: 'Bad request',
  INTERNAL_ERROR: 'Internal server error',
} as const;

// Database defaults
export const DATABASE = {
  DEFAULT_TIMEOUT: 5000, // 5 seconds
  POOL_SIZE: {
    MIN: 2,
    MAX: 10,
  },
} as const;

// Redis defaults
export const REDIS = {
  DEFAULT_TTL: 3600, // 1 hour
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;
