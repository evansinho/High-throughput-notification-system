# AI Module

This module provides LLM (Large Language Model) capabilities for the notification system using Claude (Anthropic) via LangChain.

## Features

- ✅ Claude API integration via LangChain
- ✅ Automatic retry with exponential backoff
- ✅ Comprehensive error handling
- ✅ Cost tracking and usage monitoring
- ✅ Health checks and connection testing
- ✅ Request/response logging

## Setup

### 1. Install Dependencies

```bash
npm install @langchain/core @langchain/anthropic langchain
```

### 2. Configure Environment Variables

Add to your `.env` file:

```env
# AI Configuration
ANTHROPIC_API_KEY=your-anthropic-api-key-here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_MAX_TOKENS=4096
ANTHROPIC_TEMPERATURE=0.7
```

Get your API key from: https://console.anthropic.com/

### 3. Import Module

Add to your module imports:

```typescript
import { AIModule } from './ai/ai.module';

@Module({
  imports: [AIModule],
})
export class AppModule {}
```

## Usage

### Basic Completion

```typescript
import { LLMService } from './ai/services/llm.service';

constructor(private readonly llmService: LLMService) {}

async generateNotification() {
  const response = await this.llmService.generateCompletion({
    systemPrompt: 'You are a helpful assistant for notifications.',
    userPrompt: 'Write a welcome email subject line.',
    maxTokens: 100,
  });

  console.log(response.content);
  console.log('Tokens used:', response.usage.totalTokens);
  console.log('Latency:', response.latencyMs, 'ms');
}
```

### With Cost Tracking

```typescript
import { LLMService } from './ai/services/llm.service';
import { CostTrackingService } from './ai/services/cost-tracking.service';
import { LLMMetrics } from './ai/interfaces/llm.interface';

constructor(
  private readonly llmService: LLMService,
  private readonly costTrackingService: CostTrackingService,
) {}

async generateWithTracking() {
  const response = await this.llmService.generateCompletion({
    userPrompt: 'Generate a notification message.',
  });

  const cost = this.llmService.calculateCost(response.usage);

  const metric: LLMMetrics = {
    requestId: 'req-123',
    model: response.model,
    latencyMs: response.latencyMs,
    tokenUsage: response.usage,
    cost,
    success: true,
    timestamp: new Date(),
  };

  this.costTrackingService.trackRequest(metric);

  // Get statistics
  const stats = this.costTrackingService.getStatistics();
  console.log('Total cost:', stats.totalCost);
  console.log('Average latency:', stats.averageLatency);
}
```

## API Endpoints

The module exposes the following REST endpoints:

### POST /ai/completion

Generate a completion from a prompt.

**Request:**
```json
{
  "systemPrompt": "You are a helpful assistant.",
  "userPrompt": "Write a welcome message.",
  "temperature": 0.7,
  "maxTokens": 100
}
```

**Response:**
```json
{
  "success": true,
  "requestId": "uuid-here",
  "response": "Welcome to our service!",
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "usage": {
      "inputTokens": 15,
      "outputTokens": 8,
      "totalTokens": 23
    },
    "cost": "0.000075",
    "latencyMs": 1234
  }
}
```

### GET /ai/health

Check LLM service health.

**Response:**
```json
{
  "status": "healthy",
  "service": "anthropic-claude",
  "timestamp": "2024-12-08T12:00:00.000Z"
}
```

### GET /ai/stats

Get usage statistics and cost breakdown.

**Response:**
```json
{
  "overall": {
    "totalRequests": 150,
    "successfulRequests": 148,
    "failedRequests": 2,
    "successRate": 0.9867,
    "totalCost": 0.456,
    "averageCost": 0.00304,
    "totalTokens": 12450,
    "averageTokens": 83,
    "averageLatency": 1234,
    "p50Latency": 1100,
    "p95Latency": 2000,
    "p99Latency": 2500
  },
  "today": {
    "cost": "0.123456",
    "tokens": {
      "inputTokens": 3000,
      "outputTokens": 1500,
      "totalTokens": 4500
    }
  },
  "breakdown": {
    "byModel": {
      "requests": {
        "claude-3-5-sonnet-20241022": 150
      },
      "costs": {
        "claude-3-5-sonnet-20241022": "0.456000"
      }
    },
    "errors": {
      "RATE_LIMIT_ERROR": 2
    }
  }
}
```

## Testing

### Manual Test Script

Run the test script:

```bash
npx ts-node src/ai/test-ai.ts
```

### Using curl

Test the completion endpoint:

```bash
curl -X POST http://localhost:3000/ai/completion \
  -H "Content-Type: application/json" \
  -d '{
    "systemPrompt": "You are a helpful assistant.",
    "userPrompt": "Say hello!",
    "maxTokens": 50
  }'
```

Check health:

```bash
curl http://localhost:3000/ai/health
```

Get statistics:

```bash
curl http://localhost:3000/ai/stats
```

## Error Handling

The service automatically handles and retries the following errors:

### Retryable Errors (with exponential backoff)
- **Rate Limit (429)**: Retries up to 3 times with increasing delays
- **Server Errors (5xx)**: Temporary server issues
- **Timeout Errors**: Network timeouts
- **Network Errors**: Connection failures

### Non-Retryable Errors (fails immediately)
- **Authentication (401)**: Invalid API key
- **Invalid Request (400)**: Malformed request

### Retry Strategy

- Max retries: 3
- Base delay: 1 second
- Backoff: Exponential (1s, 2s, 4s)
- Jitter: ±25% to prevent thundering herd

## Cost Information

**Claude 3.5 Sonnet Pricing (as of Dec 2024):**
- Input tokens: $3 per million tokens
- Output tokens: $15 per million tokens

**Example costs:**
- Small prompt (100 tokens): ~$0.0003
- Medium prompt (1,000 tokens): ~$0.003
- Large prompt (10,000 tokens): ~$0.03

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   AIModule                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌────────────────┐         ┌──────────────────┐  │
│  │  AIController  │────────▶│   LLMService     │  │
│  │                │         │  - Retries       │  │
│  │ - POST /ai/    │         │  - Error Handle  │  │
│  │   completion   │         │  - Cost Calc     │  │
│  │ - GET /ai/     │         └──────────────────┘  │
│  │   health       │                │              │
│  │ - GET /ai/     │                │              │
│  │   stats        │                ▼              │
│  └────────────────┘         ┌──────────────────┐  │
│          │                  │  @langchain/     │  │
│          │                  │  anthropic       │  │
│          ▼                  │                  │  │
│  ┌────────────────┐         │  ChatAnthropic   │  │
│  │ CostTracking   │         └──────────────────┘  │
│  │ Service        │                │              │
│  │                │                ▼              │
│  │ - Track usage  │         ┌──────────────────┐  │
│  │ - Statistics   │         │  Claude API      │  │
│  │ - Monitoring   │         │  (Anthropic)     │  │
│  └────────────────┘         └──────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Best Practices

1. **Always track costs** - Use CostTrackingService for all production requests
2. **Set reasonable token limits** - Prevent runaway costs with maxTokens
3. **Monitor error rates** - Check error breakdown regularly
4. **Use appropriate models** - Choose based on task complexity
5. **Cache when possible** - Store frequent responses to reduce costs
6. **Test locally first** - Use the test script before production deployment

## Future Enhancements

- [ ] Add streaming support for long responses
- [ ] Implement response caching
- [ ] Add support for multiple LLM providers (OpenAI, local models)
- [ ] Integrate with Prometheus for metrics
- [ ] Add rate limiting per user/tenant
- [ ] Implement request queuing for better cost control
- [ ] Add A/B testing for different prompts
- [ ] Support for embeddings and vector operations