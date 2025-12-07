# Developer Onboarding Guide

Get up and running with the Notification System in under 15 minutes.

---

## Document Information

- **Version**: 1.0.0
- **Last Updated**: December 7, 2025
- **Maintained By**: Platform Engineering Team

---

## Welcome! 👋

Welcome to the Notification System team! This guide will help you set up your local development environment and make your first contribution.

**Time to Complete**: < 15 minutes

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Development Workflow](#development-workflow)
4. [Project Structure](#project-structure)
5. [Making Your First Change](#making-your-first-change)
6. [Testing](#testing)
7. [Common Tasks](#common-tasks)
8. [Getting Help](#getting-help)

---

## Prerequisites

### Required Software

Install these before starting (takes ~10 minutes):

| Software | Version | Download Link | Verification |
|----------|---------|--------------|--------------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) | `node --version` |
| npm | 9+ | Included with Node.js | `npm --version` |
| Docker Desktop | 20+ | [docker.com](https://www.docker.com/products/docker-desktop) | `docker --version` |
| Git | 2.30+ | [git-scm.com](https://git-scm.com/) | `git --version` |
| VS Code | Latest | [code.visualstudio.com](https://code.visualstudio.com/) | Optional but recommended |

### Recommended VS Code Extensions

Install these for the best development experience:

- **ESLint**: Linting and code quality
- **Prettier**: Code formatting
- **Prisma**: Database schema editing
- **GitLens**: Git supercharged
- **Thunder Client**: API testing (alternative to Postman)
- **Docker**: Docker container management

**Install all at once**:
```bash
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension Prisma.prisma
code --install-extension eamodio.gitlens
code --install-extension rangav.vscode-thunder-client
code --install-extension ms-azuretools.vscode-docker
```

---

## Quick Start

### Step 1: Clone the Repository (1 minute)

```bash
# Clone the repo
git clone <repo-url>
cd notification-system

# Check you're on the right branch
git status
# Expected: On branch main
```

---

### Step 2: Install Dependencies (2 minutes)

```bash
# Install all npm packages
npm install

# Verify installation
npm list --depth=0
# Expected: ~50 packages installed
```

---

### Step 3: Configure Environment Variables (1 minute)

```bash
# Copy example environment file
cp .env.example .env

# Open .env in your editor
code .env  # Or use your preferred editor

# ⚠️ IMPORTANT: Change the JWT_SECRET to a secure value
# Replace this line:
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-minimum-32-characters

# With something like:
JWT_SECRET=my-dev-secret-$(date +%s)-$(openssl rand -hex 16)
```

**Required environment variables**:
- ✅ `JWT_SECRET`: Must be at least 32 characters (CRITICAL!)
- ✅ `DATABASE_URL`: Already configured for local Docker
- ✅ `REDIS_HOST`, `KAFKA_BROKER`: Already configured for local Docker

**Optional environment variables** (for external integrations):
- `SENDGRID_API_KEY`: If testing email (falls back to mock)
- `TWILIO_AUTH_TOKEN`: If testing SMS (falls back to mock)
- `FIREBASE_PROJECT_ID`: If testing push (falls back to mock)

---

### Step 4: Start the Application (3 minutes)

```bash
# Start everything with one command!
npm run dev

# This command will:
# 1. Start Docker containers (PostgreSQL, Redis, Kafka, Zookeeper, Kafka UI)
# 2. Wait for services to be healthy
# 3. Run database migrations
# 4. Start the NestJS application in watch mode

# Expected output:
# [Docker] Starting containers...
# [Docker] Waiting for services to be ready...
# [Docker] ✓ PostgreSQL is ready
# [Docker] ✓ Redis is ready
# [Docker] ✓ Kafka is ready
# [Prisma] Running migrations...
# [Prisma] ✓ Migrations complete
# [Nest] Starting application...
# [Nest] ✓ Application is running on: http://localhost:3000
```

**Wait for**:
```
[Nest] Nest application successfully started
```

---

### Step 5: Verify Everything Works (2 minutes)

**Open a new terminal** and run these commands:

```bash
# 1. Check application health
curl http://localhost:3000/health | jq

# Expected output:
# {
#   "status": "ok",
#   "info": {
#     "database": { "status": "up" },
#     "redis": { "status": "up" },
#     "kafka": { "status": "up" }
#   }
# }
```

**2. Test registration and login**:
```bash
# Register a new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "name": "Test User"
  }' | jq

# Expected: { "id": "...", "email": "test@example.com", ... }

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }' | jq

# Expected: { "access_token": "eyJ..." }

# Save the token for next step
TOKEN=<paste-token-here>

# Test authenticated endpoint
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq

# Expected: User profile data
```

**3. Open the dashboards**:

| Service | URL | Credentials |
|---------|-----|-------------|
| Application | http://localhost:3000 | N/A |
| Kafka UI | http://localhost:8080 | N/A |
| Prometheus | http://localhost:9090 | N/A |
| Grafana | http://localhost:3001 | admin/admin |
| Jaeger | http://localhost:16686 | N/A |

**If all checks pass**: ✅ You're ready to start developing!

---

## Development Workflow

### Daily Workflow

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install any new dependencies
npm install

# 3. Start the application
npm run dev

# 4. Make changes (application auto-reloads on file save)

# 5. Run tests
npm test

# 6. Commit your changes
git add .
git commit -m "feat: add amazing feature"

# 7. Push to remote
git push origin feature/amazing-feature

# 8. Create pull request on GitHub
```

---

### Hot Reload

The application uses **Nodemon** for automatic reloading. When you save a file, the application will restart automatically:

```bash
# Watch for file changes
[Nest] File change detected. Starting incremental compilation...
[Nest] Successfully compiled
[Nest] Nest application successfully started
```

---

### Database Changes

**When you modify the Prisma schema**:

```bash
# 1. Edit prisma/schema.prisma
code prisma/schema.prisma

# 2. Create migration
npm run prisma:migrate

# 3. Generate Prisma Client
npm run prisma:generate

# 4. Restart application (automatic if using npm run dev)
```

---

## Project Structure

```
notification-system/
├── src/                          # Source code
│   ├── auth/                     # Authentication module
│   │   ├── auth.controller.ts    # Login, register endpoints
│   │   ├── auth.service.ts       # JWT logic, password hashing
│   │   ├── guards/               # Auth guards (JWT, roles)
│   │   └── strategies/           # Passport strategies
│   ├── users/                    # User management module
│   │   ├── users.controller.ts   # User CRUD endpoints
│   │   ├── users.service.ts      # User business logic
│   │   └── dto/                  # Data transfer objects
│   ├── notifications/            # Notification module (TO BE CREATED)
│   │   ├── notifications.controller.ts
│   │   ├── notifications.service.ts
│   │   └── dto/
│   ├── kafka/                    # Kafka module
│   │   ├── kafka-producer.service.ts
│   │   ├── kafka-consumer.service.ts
│   │   └── kafka.module.ts
│   ├── redis/                    # Redis/caching module
│   │   ├── redis.service.ts
│   │   ├── cache.service.ts
│   │   └── redis.module.ts
│   ├── prisma/                   # Database module
│   │   ├── prisma.service.ts     # Prisma client wrapper
│   │   └── prisma.module.ts
│   ├── health/                   # Health check module
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   ├── observability/            # Monitoring module
│   │   ├── metrics.service.ts    # Prometheus metrics
│   │   ├── logger.service.ts     # Pino logger
│   │   └── tracing.service.ts    # OpenTelemetry tracing
│   ├── config/                   # Configuration
│   │   ├── configuration.ts      # Environment config
│   │   └── validation.ts         # Config validation
│   ├── common/                   # Shared code
│   │   ├── filters/              # Exception filters
│   │   ├── interceptors/         # Request/response interceptors
│   │   ├── decorators/           # Custom decorators
│   │   └── constants.ts          # Constants
│   ├── app.module.ts             # Root module
│   └── main.ts                   # Application entry point
├── prisma/                       # Database
│   ├── schema.prisma             # Database schema
│   ├── migrations/               # Database migrations
│   └── seed.ts                   # Seed data
├── test/                         # Tests
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── e2e/                      # End-to-end tests
├── load-tests/                   # k6 load tests
├── monitoring/                   # Monitoring config
│   ├── prometheus.yml            # Prometheus config
│   ├── alert-rules.yml           # Alert rules
│   └── grafana/                  # Grafana dashboards
├── k8s/                          # Kubernetes manifests
├── scripts/                      # Utility scripts
├── docs/                         # Documentation
├── docker-compose.yml            # Docker services
├── .env.example                  # Environment variables template
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript config
└── README.md                     # Main documentation
```

---

## Making Your First Change

### Example: Add a New API Endpoint

Let's add a simple endpoint that returns the current time.

**Step 1: Create a new controller method**

```typescript
// src/health/health.controller.ts

@Get('/time')
getTime() {
  return {
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
```

**Step 2: Test the endpoint**

```bash
# Application auto-reloads on save

# Test the new endpoint
curl http://localhost:3000/health/time | jq

# Expected:
# {
#   "timestamp": "2025-12-07T10:00:00.000Z",
#   "timezone": "America/New_York"
# }
```

**Step 3: Write a test**

```typescript
// src/health/health.controller.spec.ts

describe('HealthController', () => {
  it('should return current time', () => {
    const result = controller.getTime();
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('timezone');
  });
});
```

**Step 4: Run the test**

```bash
npm test health.controller

# Expected: PASS
```

**Step 5: Commit your change**

```bash
git add src/health/
git commit -m "feat: add time endpoint to health controller"
```

**That's it!** You've made your first change. 🎉

---

## Testing

### Run All Tests

```bash
# Unit tests
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

---

### Test a Specific File

```bash
# Test a specific file
npm test auth.service

# Test a specific test
npm test -- -t "should hash password"
```

---

### Manual Testing with curl

```bash
# Set variables for convenience
API_URL=http://localhost:3000
EMAIL=test@example.com
PASSWORD=Test123!@#

# Register
curl -X POST $API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Test User\"}" | jq

# Login and save token
TOKEN=$(curl -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.access_token')

# Use token
curl $API_URL/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Common Tasks

### View Logs

```bash
# Application logs
docker-compose logs app -f

# Database logs
docker-compose logs postgres -f

# All logs
docker-compose logs -f
```

---

### Access Database

```bash
# Prisma Studio (GUI)
npx prisma studio
# Opens in browser: http://localhost:5555

# PostgreSQL CLI
docker exec -it notification-postgres psql -U notification_user -d notification_db

# Run SQL query
SELECT * FROM users LIMIT 10;
```

---

### Reset Database

```bash
# ⚠️ WARNING: This deletes all data!

# Drop all tables and re-run migrations
npm run prisma:migrate reset

# Seed with test data
npm run prisma:seed
```

---

### Clear Cache

```bash
# Redis CLI
docker exec -it notification-redis redis-cli

# Flush all data
FLUSHALL

# Or flush from code
curl -X POST http://localhost:3000/admin/cache/clear \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

### View Kafka Messages

```bash
# List topics
docker exec notification-kafka kafka-topics \
  --list \
  --bootstrap-server localhost:9092

# Consume messages
docker exec notification-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic notifications \
  --from-beginning \
  --max-messages 10

# Or use Kafka UI
open http://localhost:8080
```

---

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart postgres
docker-compose restart redis
docker-compose restart kafka

# Restart application only
# (Ctrl+C in terminal, then npm run dev)
```

---

## Getting Help

### Documentation

| Topic | Document |
|-------|----------|
| API Endpoints | [API.md](./API.md) |
| System Design | [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) |
| Deployment | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Troubleshooting | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) |
| Security | [SECURITY_BEST_PRACTICES.md](./SECURITY_BEST_PRACTICES.md) |
| Performance | [PERFORMANCE_TUNING_GUIDE.md](./PERFORMANCE_TUNING_GUIDE.md) |

---

### Team Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Tech Lead | techlead@example.com | Mon-Fri 9-5 EST |
| Senior Engineer | senior@example.com | Mon-Fri 10-6 EST |
| DevOps | devops@example.com | 24/7 (PagerDuty) |

---

### Communication Channels

- **Slack**: #notification-system (general discussion)
- **Slack**: #notifications-dev (development questions)
- **Slack**: #incidents (production issues)
- **GitHub Issues**: Bug reports and feature requests
- **Weekly Standup**: Tuesdays 10 AM EST (Zoom link in calendar)

---

### Common Questions

**Q: Port 3000 is already in use. What do I do?**

```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm run start:dev
```

**Q: Docker services won't start. Help!**

```bash
# Remove all containers and volumes
docker-compose down -v

# Start fresh
docker-compose up -d

# Check logs
docker-compose logs -f
```

**Q: My database migrations failed. How do I fix this?**

```bash
# Reset database (⚠️ deletes all data)
npm run prisma:migrate reset

# Or mark migration as applied
npx prisma migrate resolve --applied <migration_name>
```

**Q: How do I debug the application?**

```bash
# Start with inspector
node --inspect dist/main.js

# Open Chrome DevTools
# Go to: chrome://inspect
# Click "inspect" on your application

# Set breakpoints in VS Code
# Press F5 to start debugging
```

**Q: How do I run a single test file?**

```bash
npm test auth.service.spec.ts
```

**Q: Where do I find the admin token for testing?**

```bash
# Create an admin user (run npm run prisma:seed first)
# Then login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  | jq -r '.access_token'
```

---

## Next Steps

Now that you're set up, here are some suggested tasks to familiarize yourself with the codebase:

### Beginner Tasks

1. **Read the Architecture**: Review [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md)
2. **Explore the API**: Test all endpoints in [API.md](./API.md)
3. **Fix a Bug**: Check GitHub Issues labeled `good-first-issue`
4. **Add a Test**: Improve test coverage for an existing service
5. **Update Documentation**: Fix typos or add clarifications

### Intermediate Tasks

1. **Add a Feature**: Implement a new notification channel
2. **Optimize Performance**: Identify and fix a slow query
3. **Improve Logging**: Add more context to log messages
4. **Add Metrics**: Instrument a new business metric
5. **Write a Runbook**: Document a common operational task

### Advanced Tasks

1. **Refactor Code**: Improve code quality in a module
2. **Add Integration**: Integrate a new external service
3. **Optimize Kafka**: Improve consumer throughput
4. **Design Feature**: Write RFC for a major feature
5. **Mentor Others**: Help onboard new team members

---

## Onboarding Checklist

Track your progress:

### Week 1
- [ ] Set up local development environment
- [ ] Run application successfully
- [ ] Create your first PR (even if just a typo fix)
- [ ] Attend weekly standup
- [ ] Read SYSTEM_DESIGN.md

### Week 2
- [ ] Complete a beginner task
- [ ] Write your first test
- [ ] Review someone else's PR
- [ ] Attend team lunch
- [ ] Explore Grafana dashboards

### Week 3
- [ ] Complete an intermediate task
- [ ] Debug a production issue (with guidance)
- [ ] Give feedback on an RFC
- [ ] Present your work at standup

### Week 4
- [ ] Work on an advanced task
- [ ] Participate in on-call rotation
- [ ] Write documentation
- [ ] Mentor a new team member

---

## Feedback

We're always improving this guide. If you have suggestions or found something confusing, please:

1. Create a GitHub issue
2. Submit a PR with improvements
3. Post in #notifications-dev Slack channel
4. Email techlead@example.com

