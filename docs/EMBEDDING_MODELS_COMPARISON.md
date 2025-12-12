# Embedding Models Comparison

## Overview
This document compares different embedding model options for the notification system's vector database, evaluating them across multiple dimensions: cost, performance, quality, and operational complexity.

## Current Implementation
- **Model**: Mock hash-based embeddings
- **Dimensions**: 1536
- **Purpose**: Development and testing
- **Limitations**: Not semantically meaningful, random similarity scores

## Production Embedding Options

### 1. OpenAI text-embedding-3-small

#### Specifications
- **Dimensions**: 1536 (configurable down to 512)
- **Max Input**: 8,191 tokens
- **API Latency**: ~50-200ms
- **Quality**: MTEB score ~62.3%

#### Pricing
- **Cost**: $0.02 per 1M tokens
- **Example**: 1,000 templates (avg 50 tokens) = $0.001
- **Monthly (10K searches)**: ~$1-5

#### Pros
- Very low cost (5x cheaper than ada-002)
- High quality embeddings
- Excellent API reliability (99.9%+ uptime)
- Simple integration
- Flexible dimension reduction
- Global CDN with low latency

#### Cons
- External API dependency
- Network latency (50-200ms)
- Requires API key management
- Data leaves infrastructure
- Rate limiting considerations

#### Code Example
```typescript
import { OpenAI } from 'openai';

export class OpenAIEmbeddingService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      input: text,
      model: 'text-embedding-3-small',
      dimensions: 1536,
    });
    return response.data[0].embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Batch up to 2048 texts per request
    const response = await this.client.embeddings.create({
      input: texts,
      model: 'text-embedding-3-small',
    });
    return response.data.map(d => d.embedding);
  }
}
```

### 2. Voyage AI voyage-2

#### Specifications
- **Dimensions**: 1024
- **Max Input**: 16,000 tokens (longer context!)
- **API Latency**: ~100-300ms
- **Quality**: MTEB score ~64.8% (better than OpenAI)

#### Pricing
- **Cost**: $0.10 per 1M tokens
- **Example**: 1,000 templates (avg 50 tokens) = $0.005
- **Monthly (10K searches)**: ~$5-25

#### Pros
- Anthropic recommended (optimized for Claude)
- Higher quality than OpenAI for retrieval tasks
- Longer context window (16K tokens)
- Optimized for RAG applications
- Better for domain-specific content
- Batch API support

#### Cons
- 5x more expensive than OpenAI text-embedding-3-small
- Smaller company (reliability unknown)
- Less documentation/community support
- Network latency
- Newer service (less battle-tested)

#### Code Example
```typescript
import { VoyageAIClient } from '@voyageai/voyage';

export class VoyageEmbeddingService {
  private client: VoyageAIClient;

  constructor() {
    this.client = new VoyageAIClient({
      apiKey: process.env.VOYAGE_API_KEY,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embed({
      texts: [text],
      model: 'voyage-2',
      input_type: 'document', // or 'query' for search queries
    });
    return response.embeddings[0];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Batch up to 128 texts per request
    const response = await this.client.embed({
      texts,
      model: 'voyage-2',
      input_type: 'document',
    });
    return response.embeddings;
  }
}
```

### 3. Cohere embed-english-v3.0

#### Specifications
- **Dimensions**: 1024
- **Max Input**: 512 tokens
- **API Latency**: ~100-250ms
- **Quality**: MTEB score ~64.5%

#### Pricing
- **Cost**: $0.10 per 1M tokens (search), $0.10 per 1M tokens (storage)
- **Example**: 1,000 templates = $0.005
- **Monthly (10K searches)**: ~$10-30

#### Pros
- Separate embeddings for documents vs queries (better quality)
- Compression options (binary, int8)
- Built-in reranking support
- Excellent for semantic search
- Good documentation

#### Cons
- Shorter context (512 tokens)
- More expensive
- Less popular than OpenAI
- Requires separate embeddings for docs and queries

#### Code Example
```typescript
import { CohereClient } from 'cohere-ai';

export class CohereEmbeddingService {
  private client: CohereClient;

  constructor() {
    this.client = new CohereClient({
      token: process.env.COHERE_API_KEY,
    });
  }

  async generateEmbedding(text: string, isQuery = false): Promise<number[]> {
    const response = await this.client.embed({
      texts: [text],
      model: 'embed-english-v3.0',
      inputType: isQuery ? 'search_query' : 'search_document',
    });
    return response.embeddings[0];
  }
}
```

### 4. Local: all-MiniLM-L6-v2 (via transformers.js)

#### Specifications
- **Dimensions**: 384
- **Max Input**: 256 tokens
- **Inference Latency**: ~50-200ms (CPU), ~10-50ms (GPU)
- **Quality**: MTEB score ~58.8%
- **Model Size**: 23MB

#### Pricing
- **Cost**: $0 (after compute costs)
- **Compute**: Minimal CPU/RAM overhead
- **Hosting**: ~$5-20/month for dedicated instance

#### Pros
- Zero API costs
- No external dependencies
- Data stays in infrastructure
- No rate limits
- Predictable latency
- Works offline
- No vendor lock-in
- Small model size

#### Cons
- Lower quality than cloud options
- Shorter context (256 tokens)
- Requires compute resources
- Need to manage model updates
- CPU inference slower than API calls
- Less dimensions (384 vs 1024-1536)

#### Code Example
```typescript
import { pipeline, env } from '@xenova/transformers';

export class LocalEmbeddingService {
  private extractor: any;

  async initialize() {
    // Use local model cache
    env.cacheDir = './models';

    this.extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true } // Use quantized model for faster inference
    );
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    return Array.from(output.data);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Process in parallel
    const results = await Promise.all(
      texts.map(text => this.generateEmbedding(text))
    );
    return results;
  }
}
```

### 5. Local: bge-small-en-v1.5

#### Specifications
- **Dimensions**: 384
- **Max Input**: 512 tokens
- **Inference Latency**: ~100-300ms (CPU), ~20-80ms (GPU)
- **Quality**: MTEB score ~62.8% (best for local models)
- **Model Size**: 134MB

#### Pricing
- **Cost**: $0 (after compute costs)
- **Compute**: Moderate CPU/RAM overhead
- **Hosting**: ~$10-30/month for dedicated instance

#### Pros
- Zero API costs
- Better quality than MiniLM
- Longer context (512 tokens)
- State-of-the-art for local models
- No external dependencies
- Works offline

#### Cons
- Larger model size (134MB vs 23MB)
- Slower inference than MiniLM
- Still lower quality than cloud options
- Requires more compute resources

## Comparison Matrix

| Model | Dimensions | Quality | Cost (1M tokens) | Latency | Context | Pros | Cons |
|-------|-----------|---------|------------------|---------|---------|------|------|
| **OpenAI text-embedding-3-small** | 1536 | ⭐⭐⭐⭐ | $0.02 | 50-200ms | 8K | Cheap, reliable, simple | External API |
| **Voyage AI voyage-2** | 1024 | ⭐⭐⭐⭐⭐ | $0.10 | 100-300ms | 16K | Best quality, RAG-optimized | 5x more expensive |
| **Cohere embed-v3** | 1024 | ⭐⭐⭐⭐ | $0.10 | 100-250ms | 512 | Doc/query separation | Short context |
| **Local: MiniLM** | 384 | ⭐⭐⭐ | $0 | 50-200ms | 256 | Free, fast, small | Lower quality |
| **Local: BGE-small** | 384 | ⭐⭐⭐⭐ | $0 | 100-300ms | 512 | Best local quality | Larger, slower |

## Recommendation by Use Case

### For Notification System (Current Project)

**Recommended: OpenAI text-embedding-3-small**

Rationale:
1. **Cost**: At $0.02 per 1M tokens, extremely affordable
   - 1,000 templates × 50 tokens = $0.001 one-time
   - 10K monthly searches = ~$1-5/month
2. **Quality**: More than sufficient for notification template matching
3. **Simplicity**: Dead simple integration, battle-tested
4. **Latency**: 50-200ms acceptable for non-realtime use case
5. **Scalability**: No infrastructure management needed

**Alternative: Local BGE-small-en-v1.5** (if budget is extremely tight or data privacy critical)

### Decision Framework

Choose **OpenAI text-embedding-3-small** if:
- Budget allows $5-50/month
- Want simplicity and reliability
- Don't have strict data residency requirements
- Need fast time to production

Choose **Voyage AI voyage-2** if:
- Using Claude (Anthropic) for generation
- Need best possible retrieval quality
- Budget allows $25-100/month
- Have longer documents (>8K tokens)
- Willing to invest in optimization

Choose **Local (BGE-small)** if:
- Zero external costs required
- Strict data privacy requirements
- Have compute resources available
- Can accept lower quality
- Need offline capability

Choose **Cohere embed-v3** if:
- Need separate doc/query embeddings
- Want built-in reranking
- Have specific semantic search requirements

## Migration Path

### Phase 1: Start with Mock (Current)
- Use for development and testing
- Zero cost, immediate availability
- Perfect for infrastructure setup

### Phase 2: Add OpenAI (Recommended Next Step)
```typescript
// Add to .env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...

// Modify EmbeddingService
if (configService.get('embedding.provider') === 'openai') {
  return new OpenAIEmbeddingService();
} else {
  return new MockEmbeddingService();
}
```

### Phase 3: Experiment and Optimize
- Run A/B tests comparing:
  - OpenAI vs Voyage AI (quality)
  - Cloud vs Local (cost/latency)
- Measure actual retrieval quality with RAGAS
- Optimize based on real metrics

### Phase 4: Scale (if needed)
- Add caching layer (Redis) for frequent queries
- Implement batch processing for uploads
- Consider hybrid approach:
  - Local for development/staging
  - Cloud for production

## Implementation Template

```typescript
// src/vector-db/services/embedding-factory.service.ts
@Injectable()
export class EmbeddingFactoryService {
  create(provider: string): IEmbeddingService {
    switch (provider) {
      case 'openai':
        return new OpenAIEmbeddingService();
      case 'voyage':
        return new VoyageEmbeddingService();
      case 'cohere':
        return new CohereEmbeddingService();
      case 'local-minilm':
        return new LocalMiniLMService();
      case 'local-bge':
        return new LocalBGEService();
      default:
        return new MockEmbeddingService();
    }
  }
}

// Interface
interface IEmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  getModelInfo(): { name: string; dimensions: number };
}
```

## Cost Projection (Notification System)

### Assumptions
- 1,000 notification templates (avg 50 tokens each)
- 10,000 searches per month (avg 20 tokens each)
- Template re-indexing: 1x per month

### Monthly Costs

**OpenAI text-embedding-3-small**
- Templates: 1,000 × 50 tokens × $0.02 / 1M = $0.001
- Searches: 10,000 × 20 tokens × $0.02 / 1M = $0.004
- **Total: ~$0.01/month** (essentially free)

**Voyage AI voyage-2**
- Templates: 1,000 × 50 tokens × $0.10 / 1M = $0.005
- Searches: 10,000 × 20 tokens × $0.10 / 1M = $0.02
- **Total: ~$0.03/month** (still essentially free)

**Local BGE-small**
- Infrastructure: $10-20/month (if dedicated instance needed)
- **Total: $0-20/month** (depends on existing infrastructure)

**Conclusion**: For this scale, cost is not a factor. Choose based on quality and operational preferences.

## Next Steps

1. Implement OpenAI text-embedding-3-small as primary provider
2. Add embedding provider configuration to .env
3. Create embedding factory pattern for easy switching
4. Run quality tests comparing mock vs OpenAI
5. Measure actual latency and cost in production
6. Consider Voyage AI if quality improvement needed
7. Document embedding provider selection in architecture docs

## References

- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Voyage AI Documentation](https://docs.voyageai.com/)
- [Cohere Embed API](https://docs.cohere.com/reference/embed)
- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
