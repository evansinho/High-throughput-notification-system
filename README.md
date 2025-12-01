# 🔔 High-Throughput Notification System

A production-grade notification system built with NestJS, designed to handle **50,000+ notifications per second**. Features event-driven architecture with Kafka, multi-layer caching with Redis, and PostgreSQL for data persistence.

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development](#development)
- [Database Management](#database-management)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## ✨ Features

- **Event-Driven Architecture**: Kafka-based message queuing for asynchronous processing
- **High-Performance Caching**: Redis with 6 caching patterns (cache-aside, versioned keys, tag-based invalidation)
- **Rate Limiting**: Multi-tier rate limiting (3/sec, 20/10sec, 100/min)
- **Type Safety**: Full TypeScript with strict mode enabled
- **Database**: PostgreSQL with Prisma ORM for type-safe queries
- **Authentication**: JWT-based auth with Passport
- **Health Checks**: Built-in health checks for all services
- **Docker Support**: Complete Docker Compose setup for local development
- **Message Schemas**: Comprehensive Kafka message schemas with validation

## 🏗 Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Client    │─────▶│  NestJS API │─────▶│   Kafka     │
└─────────────┘      └─────────────┘      └─────────────┘
                           │                      │
                           ▼                      ▼
                     ┌──────────┐          ┌──────────┐
                     │  Redis   │          │ Consumer │
                     │  Cache   │          │ Workers  │
                     └──────────┘          └──────────┘
                           │                      │
                           ▼                      ▼
                     ┌──────────────────────────────┐
                     │       PostgreSQL DB          │
                     └──────────────────────────────┘
```

## 📦 Prerequisites

- **Node.js**: 18+ ([Download](https://nodejs.org/))
- **Docker**: 20+ ([Download](https://www.docker.com/products/docker-desktop))
- **Docker Compose**: 2.0+ (included with Docker Desktop)
- **npm** or **yarn**: Latest version

## 🚀 Quick Start

Get up and running in under 2 minutes:

```bash
# 1. Clone the repository
git clone <repo-url>
cd notification-system

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and update JWT_SECRET (minimum 32 characters)

# 4. Start all services (Docker + NestJS)
npm run dev
```

That's it! The application will be running at `http://localhost:3000`

### What Just Happened?

The `npm run dev` command:
1. Starts Docker containers (PostgreSQL, Redis, Kafka, Zookeeper, Kafka UI)
2. Waits for services to be healthy
3. Starts the NestJS application in watch mode

### Verify Everything Works

```bash
# Check health endpoints
curl http://localhost:3000/health

# Check Kafka UI
open http://localhost:8080

# Check Docker services
docker-compose ps
```

## 🛠 Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Docker + NestJS in watch mode (recommended) |
| `npm run start:dev` | Start NestJS only (requires Docker services running) |
| `npm run start:prod` | Start in production mode |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:cov` | Generate test coverage report |

### Docker Commands

| Command | Description |
|---------|-------------|
| `npm run docker:up` | Start all Docker services |
| `npm run docker:down` | Stop all Docker services |
| `npm run docker:logs` | Follow Docker logs |
| `docker-compose ps` | Check service status |
| `docker-compose restart <service>` | Restart a specific service |

### Prisma/Database Commands

| Command | Description |
|---------|-------------|
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Create and apply migration |
| `npm run prisma:seed` | Seed database with test data |
| `npx prisma studio` | Open Prisma Studio (DB GUI) |

## 💾 Database Management

### Backup Database

```bash
# Create a timestamped backup (stored in ./backups)
npm run db:backup

# Backups are automatically compressed and old backups are cleaned up (keeps last 7)
```

### Restore Database

```bash
# List available backups
ls -lh backups/

# Restore from a specific backup
npm run db:restore backups/notification_db_20231201_120000.sql.gz

# ⚠️ WARNING: This will delete all existing data!
```

### Manual Database Operations

```bash
# Connect to PostgreSQL
docker exec -it notification-postgres psql -U notification_user -d notification_db

# Export schema only
docker exec -t notification-postgres pg_dump -U notification_user -s notification_db > schema.sql

# Reset database (drop and recreate)
npm run prisma:migrate reset
```

## ⚙️ Configuration

### Environment Variables

The application uses environment variables for configuration. Copy `.env.example` to `.env` and customize:

```bash
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL="postgresql://notification_user:notification_password@localhost:5432/notification_db?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Kafka
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=notification-service
KAFKA_CONSUMER_GROUP=notification-workers

# JWT (⚠️ Change this to a secure secret!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-minimum-32-characters
JWT_EXPIRATION=7d

# Feature Flags
ENABLE_KAFKA_CONSUMER=true
ENABLE_RATE_LIMITING=true
```

### Configuration Validation

Environment variables are validated on startup using Joi schema. If any required variable is missing or invalid, the application will fail to start with a clear error message.

## 📚 API Documentation

### Base URL
```
http://localhost:3000
```

### Health Checks

```bash
# Full health check (all services)
GET /health

# Liveness check (is app running?)
GET /health/liveness

# Readiness check (is app ready to serve traffic?)
GET /health/readiness
```

### Authentication

```bash
# Register new user
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}

# Login
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}

# Get current user (protected)
GET /auth/me
Authorization: Bearer <token>
```

### Users

```bash
# Get all users (with caching)
GET /users

# First request: hits database
# Subsequent requests (within 60s): returned from cache
```

### Testing Rate Limiting

```bash
# Send 10 requests quickly
for i in {1..10}; do curl http://localhost:3000/health; done

# You'll hit rate limits:
# - 3 requests per second
# - 20 requests per 10 seconds
# - 100 requests per minute
```

## 🧪 Testing

### Run Tests

```bash
# Unit tests
npm run test

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

### Manual Testing with curl

```bash
# Test cache behavior
curl http://localhost:3000/users  # First hit (DB query)
curl http://localhost:3000/users  # Second hit (from cache)

# Test authentication
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  | jq -r '.access_token')

curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## 🔧 Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)

# Or use a different port
PORT=3001 npm run start:dev
```

### Docker Services Not Starting

```bash
# Check Docker daemon is running
docker ps

# Remove all containers and start fresh
docker-compose down -v
docker-compose up -d

# Check service logs
docker-compose logs postgres
docker-compose logs redis
docker-compose logs kafka
```

### Prisma Migration Issues

```bash
# Reset database (⚠️ deletes all data)
npm run prisma:migrate reset

# Generate Prisma Client
npm run prisma:generate

# Apply pending migrations
npm run prisma:migrate deploy
```

### Kafka Connection Issues

```bash
# Check Kafka is running
docker-compose ps kafka

# Check Kafka logs
docker-compose logs kafka

# Restart Kafka
docker-compose restart kafka

# Verify Kafka is accessible
docker exec -it notification-kafka kafka-topics --list --bootstrap-server localhost:9092
```

### Redis Connection Issues

```bash
# Check Redis is running
docker-compose ps redis

# Test Redis connection
docker exec -it notification-redis redis-cli ping
# Should return: PONG

# Flush Redis cache (clears all data)
docker exec -it notification-redis redis-cli FLUSHALL
```

### Environment Variable Issues

```bash
# Validate .env file exists
test -f .env && echo "✓ .env exists" || echo "✗ .env missing"

# Check required variables
grep JWT_SECRET .env

# Regenerate from example
cp .env.example .env
```

## 📂 Project Structure

```
notification-system/
├── src/
│   ├── auth/              # JWT authentication module
│   ├── config/            # Environment configuration
│   ├── health/            # Health check endpoints
│   ├── kafka/             # Kafka producer & consumer
│   ├── prisma/            # Prisma service
│   ├── redis/             # Redis & caching services
│   ├── app.module.ts      # Root module
│   └── main.ts            # Application entry point
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── migrations/        # Database migrations
│   └── seed.ts            # Seed data
├── scripts/
│   ├── db-backup.sh       # Database backup script
│   └── db-restore.sh      # Database restore script
├── docker-compose.yml     # Docker services configuration
├── .env.example           # Environment variables template
└── package.json           # Dependencies and scripts
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is part of a learning journey for staff engineer skills development.

## 🙏 Acknowledgments

Built with:
- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [Kafka](https://kafka.apache.org/) - Distributed event streaming
- [Redis](https://redis.io/) - In-memory data store
- [PostgreSQL](https://www.postgresql.org/) - Relational database
