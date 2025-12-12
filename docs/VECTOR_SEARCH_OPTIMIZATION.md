# Vector Search Optimization Guide

## Overview
This document provides strategies for optimizing vector search parameters in the notification system's Qdrant implementation.

## Current Configuration

```typescript
// Default search parameters
const searchQuery = {
  queryText: string,
  topK: 10,                    // Number of results
  scoreThreshold: 0.7,         // Minimum similarity score
  filter: {                     // Metadata filters
    channel?: 'email' | 'sms' | 'push',
    category?: 'transactional' | 'marketing' | 'system',
    tone?: string,
    language?: string,
    tags?: string[],
  }
};
```

## Key Parameters to Optimize

### 1. topK (Number of Results)

**What it controls**: How many similar templates to retrieve

**Trade-offs**:
- **Higher topK (10-20)**:
  - Pro: More context for LLM
  - Pro: Better chance of finding perfect match
  - Con: More noise, irrelevant results
  - Con: Higher LLM token cost
  - Con: Slower generation

- **Lower topK (1-5)**:
  - Pro: Only most relevant results
  - Pro: Faster, cheaper
  - Pro: Less noise for LLM
  - Con: Might miss good alternatives
  - Con: Less diverse options

**Recommended Values by Use Case**:
```typescript
const topKByCategory = {
  transactional: 3,    // Need precision, consistency
  marketing: 5,        // Want variety, creativity
  system: 2,           // Need accuracy, clarity
  welcome: 5,          // Want warm, diverse options
};
```

**Optimization Strategy**:
```typescript
function getOptimalTopK(context: NotificationContext): number {
  // Base value
  let topK = 5;

  // Adjust for confidence in filters
  if (context.filter && Object.keys(context.filter).length >= 3) {
    topK = 3; // Strong filters = fewer results needed
  }

  // Adjust for template library size
  const templateCount = await qdrantService.countTemplates();
  if (templateCount < 50) {
    topK = Math.min(topK, Math.floor(templateCount * 0.2));
  }

  // Adjust for category
  if (context.category === 'transactional') {
    topK = Math.min(topK, 3);
  }

  return topK;
}
```

### 2. scoreThreshold (Minimum Similarity Score)

**What it controls**: Minimum cosine similarity to include result (0.0 - 1.0)

**Understanding Scores**:
- **0.9 - 1.0**: Near-identical content
- **0.8 - 0.9**: Very similar, same topic and structure
- **0.7 - 0.8**: Similar topic, different structure/wording
- **0.6 - 0.7**: Related but distinct
- **< 0.6**: Loosely related or unrelated

**Trade-offs**:
- **Higher threshold (0.8-0.9)**:
  - Pro: Only highly relevant results
  - Pro: Consistent quality
  - Con: May return no results
  - Con: Miss good alternatives

- **Lower threshold (0.5-0.7)**:
  - Pro: More results
  - Pro: Better recall
  - Con: More noise
  - Con: Quality variance

**Recommended Values**:
```typescript
const thresholdByCategory = {
  transactional: 0.75,   // Need high relevance
  marketing: 0.65,       // Can be more creative
  system: 0.80,          // Need accuracy
};

const thresholdByEmbedding = {
  'openai-3-small': 0.70,      // Well-calibrated
  'voyage-2': 0.75,            // Higher quality embeddings
  'local-minilm': 0.60,        // Lower quality, adjust threshold
  'mock': 0.0,                 // No semantic meaning
};
```

**Dynamic Threshold Strategy**:
```typescript
async function getOptimalThreshold(
  context: NotificationContext,
  embeddingProvider: string,
): Promise<number> {
  // Base threshold by provider
  let threshold = thresholdByEmbedding[embeddingProvider] || 0.70;

  // Adjust for category
  const categoryAdjustment = {
    transactional: +0.05,
    marketing: -0.05,
    system: +0.10,
  };
  threshold += categoryAdjustment[context.category] || 0;

  // Adjust based on template library quality
  const avgTemplateQuality = await getAverageTemplateQuality();
  if (avgTemplateQuality < 0.7) {
    threshold -= 0.05; // Lower bar if templates are lower quality
  }

  // Clamp to reasonable range
  return Math.max(0.5, Math.min(0.9, threshold));
}
```

**Fallback Strategy**:
```typescript
async function searchWithFallback(
  query: VectorSearchQuery,
): Promise<VectorSearchResult[]> {
  let threshold = query.scoreThreshold ?? 0.70;
  let results: VectorSearchResult[] = [];

  // Try with initial threshold
  results = await qdrantService.search(embedding, {
    ...query,
    scoreThreshold: threshold,
  });

  // If no results, gradually lower threshold
  const fallbackThresholds = [0.65, 0.60, 0.55, 0.50];

  for (const fallbackThreshold of fallbackThresholds) {
    if (results.length >= 3) break; // Got enough results

    results = await qdrantService.search(embedding, {
      ...query,
      scoreThreshold: fallbackThreshold,
    });
  }

  // Still no results? Use zero-shot generation
  if (results.length === 0) {
    logger.warn('No templates found, using zero-shot generation');
    return [];
  }

  return results;
}
```

### 3. Metadata Filtering

**What it controls**: Which templates to consider based on metadata

**Available Filters**:
```typescript
interface VectorFilter {
  channel?: 'email' | 'sms' | 'push';      // Delivery channel
  category?: 'transactional' | 'marketing' | 'system';
  tone?: string;                            // 'professional', 'friendly', etc.
  language?: string;                        // 'en', 'es', etc.
  tags?: string[];                          // ['password', 'security']
}
```

**Filter Strategies**:

#### Strategy 1: Strict Filtering (High Precision)
```typescript
const filter: VectorFilter = {
  channel: notification.channel,      // MUST match
  category: notification.category,    // MUST match
  language: notification.language,    // MUST match
  tags: notification.tags,            // MUST match at least one
};
```

**Use when**:
- Large template library (>500 templates)
- Clear requirements
- Quality > quantity

#### Strategy 2: Loose Filtering (High Recall)
```typescript
const filter: VectorFilter = {
  channel: notification.channel,      // Only filter channel
  // Let vector similarity handle the rest
};
```

**Use when**:
- Small template library (<100 templates)
- Exploratory search
- Want diverse options

#### Strategy 3: Hierarchical Filtering
```typescript
async function searchWithHierarchicalFilters(
  query: VectorSearchQuery,
): Promise<VectorSearchResult[]> {
  // Try with all filters
  let results = await search({
    ...query,
    filter: {
      channel: query.filter.channel,
      category: query.filter.category,
      language: query.filter.language,
      tags: query.filter.tags,
    },
  });

  if (results.length >= 3) return results;

  // Relax tone requirement
  results = await search({
    ...query,
    filter: {
      channel: query.filter.channel,
      category: query.filter.category,
      language: query.filter.language,
    },
  });

  if (results.length >= 3) return results;

  // Relax category requirement
  results = await search({
    ...query,
    filter: {
      channel: query.filter.channel,
      language: query.filter.language,
    },
  });

  return results;
}
```

#### Strategy 4: Performance-Based Filtering
```typescript
// Add performance metadata to templates
interface TemplateMetadata {
  openRate?: number;
  clickRate?: number;
  conversionRate?: number;
  unsubscribeRate?: number;
  usageCount?: number;
  lastUsed?: Date;
}

// Filter by performance thresholds
async function searchHighPerformers(
  query: VectorSearchQuery,
): Promise<VectorSearchResult[]> {
  const results = await search(query);

  // Rerank by performance metrics
  return results
    .filter(r => {
      const meta = r.payload.metadata as TemplateMetadata;
      return (
        (meta.openRate ?? 0) >= 0.25 &&      // Good open rate
        (meta.unsubscribeRate ?? 0) <= 0.01  // Low unsubscribe
      );
    })
    .sort((a, b) => {
      const scoreA = calculatePerformanceScore(a.payload.metadata);
      const scoreB = calculatePerformanceScore(b.payload.metadata);
      return scoreB - scoreA;
    });
}
```

### 4. HNSW Index Parameters (Qdrant Configuration)

**What it controls**: Qdrant's internal search algorithm performance

**Key Parameters**:
```yaml
# In Qdrant collection configuration
hnsw_config:
  m: 16                      # Number of connections per node
  ef_construct: 100          # Construction time quality
  full_scan_threshold: 10000 # When to use brute force
```

**Parameter Guidelines**:

#### m (Number of Connections)
- **Default**: 16
- **Higher (32-48)**: Better recall, more memory, slower indexing
- **Lower (8-12)**: Faster indexing, less memory, lower recall

**Recommendation for notification system**: Keep default 16
- Good balance for ~1,000-10,000 templates
- Sufficient recall for our use case

#### ef_construct (Construction Quality)
- **Default**: 100
- **Higher (200-400)**: Better quality index, slower indexing
- **Lower (50-80)**: Faster indexing, slightly lower quality

**Recommendation**: Increase to 200 if:
- Template library is static (rare updates)
- Search quality is critical
- Have time for initial indexing

#### ef (Search Time Quality)
```typescript
// Can be set per query (not currently exposed in our wrapper)
const searchResult = await client.search(collectionName, {
  vector: embedding,
  limit: topK,
  params: {
    hnsw_ef: 128,  // Higher = better recall, slower search
  },
});
```

**Default**: 128 (good balance)
**Increase to 256-512 if**: Need maximum recall
**Decrease to 64 if**: Need faster search, can accept lower recall

### 5. Distance Metric

**Current**: Cosine similarity

**Options**:
- **Cosine**: Good for normalized vectors (OpenAI, Voyage)
- **Dot Product**: Faster, good if vectors already normalized
- **Euclidean**: Good for raw, unnormalized vectors

**Recommendation**: Keep Cosine
- Standard for text embeddings
- Works well with all providers
- Intuitive similarity scores (0-1 range)

## Advanced Optimization Techniques

### Technique 1: Reranking

**Problem**: Vector similarity != business relevance

**Solution**: Two-stage retrieval
```typescript
async function searchWithReranking(
  query: VectorSearchQuery,
): Promise<VectorSearchResult[]> {
  // Stage 1: Get broad set of candidates
  const candidates = await qdrantService.search(embedding, {
    ...query,
    topK: query.topK * 3,  // Get 3x more candidates
    scoreThreshold: 0.60,   // Lower threshold
  });

  // Stage 2: Rerank with LLM or reranking model
  const reranked = await rerankResults(candidates, query);

  // Return top K after reranking
  return reranked.slice(0, query.topK);
}

async function rerankResults(
  candidates: VectorSearchResult[],
  query: VectorSearchQuery,
): Promise<VectorSearchResult[]> {
  // Option 1: Use Cohere rerank API
  const response = await cohere.rerank({
    query: query.queryText,
    documents: candidates.map(c => c.payload.content),
    model: 'rerank-english-v2.0',
    topN: query.topK,
  });

  // Reorder based on rerank scores
  return response.results.map(r => candidates[r.index]);

  // Option 2: Use LLM for reranking (more expensive but customizable)
  // ... LLM-based reranking logic
}
```

### Technique 2: Hybrid Search

**Combine**: Vector similarity + keyword matching

```typescript
async function hybridSearch(
  query: VectorSearchQuery,
  keywords: string[],
  vectorWeight: number = 0.7,
): Promise<VectorSearchResult[]> {
  // Get vector search results
  const vectorResults = await qdrantService.search(embedding, query);

  // Get keyword search results (if implemented in Qdrant)
  const keywordResults = await keywordSearch(keywords, query.filter);

  // Merge and rerank
  const merged = mergeResults(
    vectorResults,
    keywordResults,
    vectorWeight,
  );

  return merged.slice(0, query.topK);
}

function mergeResults(
  vectorResults: VectorSearchResult[],
  keywordResults: any[],
  vectorWeight: number,
): VectorSearchResult[] {
  const scoreMap = new Map<string, number>();

  // Add vector scores
  vectorResults.forEach(r => {
    scoreMap.set(r.id, r.score * vectorWeight);
  });

  // Add keyword scores
  keywordResults.forEach(r => {
    const existing = scoreMap.get(r.id) || 0;
    scoreMap.set(r.id, existing + r.score * (1 - vectorWeight));
  });

  // Sort by combined score
  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => {
      const result = vectorResults.find(r => r.id === id) ||
                     keywordResults.find(r => r.id === id);
      return { ...result, score };
    });
}
```

### Technique 3: Query Expansion

**Expand queries** for better recall

```typescript
async function expandQuery(
  originalQuery: string,
  expansionStrategy: 'synonyms' | 'llm' | 'embedding',
): Promise<string[]> {
  switch (expansionStrategy) {
    case 'synonyms':
      // Use WordNet or synonym API
      return getSynonyms(originalQuery);

    case 'llm':
      // Use LLM to generate related terms
      const prompt = `
Given this search query: "${originalQuery}"

Generate 5 related search terms that might help find similar notifications.
Return as comma-separated list.
`;
      const response = await llmService.generateCompletion({ prompt, maxTokens: 50 });
      return response.content.split(',').map(s => s.trim());

    case 'embedding':
      // Use embedding space to find similar terms
      // (requires pre-indexed term vocabulary)
      return getEmbeddingSimilarTerms(originalQuery);
  }
}

async function searchWithExpansion(
  query: VectorSearchQuery,
): Promise<VectorSearchResult[]> {
  const expandedTerms = await expandQuery(query.queryText, 'llm');

  // Search with all expanded terms
  const allResults = await Promise.all(
    [query.queryText, ...expandedTerms].map(term =>
      qdrantService.search(
        await embeddingService.generateEmbedding(term),
        { ...query, topK: 5 }
      )
    )
  );

  // Deduplicate and merge
  const merged = deduplicateResults(allResults.flat());

  return merged.slice(0, query.topK);
}
```

### Technique 4: Caching

**Cache frequent queries** to reduce latency and cost

```typescript
@Injectable()
export class CachedVectorSearchService {
  constructor(
    private qdrantService: QdrantService,
    private embeddingService: EmbeddingService,
    private redisService: RedisService,
  ) {}

  async search(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    // Generate cache key
    const cacheKey = this.generateCacheKey(query);

    // Check cache
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Generate embedding
    const embedding = await this.embeddingService.generateEmbedding(
      query.queryText,
    );

    // Search
    const results = await this.qdrantService.search(embedding, query);

    // Cache results (TTL: 1 hour for transactional, 24 hours for marketing)
    const ttl = query.filter?.category === 'transactional' ? 3600 : 86400;
    await this.redisService.setex(cacheKey, ttl, JSON.stringify(results));

    return results;
  }

  private generateCacheKey(query: VectorSearchQuery): string {
    return `vsearch:${hash(JSON.stringify(query))}`;
  }
}
```

## Testing & Measurement

### Metrics to Track

```typescript
interface SearchMetrics {
  // Retrieval quality
  avgRelevanceScore: number;        // From RAGAS or manual eval
  avgSimilarityScore: number;       // Cosine similarity
  recallAtK: number[];              // Recall at k=1,3,5,10

  // Performance
  avgLatency: number;               // ms
  p95Latency: number;
  p99Latency: number;

  // Coverage
  noResultsRate: number;            // % of queries with 0 results
  lowScoreRate: number;             // % of results with score < 0.7

  // Business impact
  avgOpenRate: number;              // For generated notifications
  avgClickRate: number;
  avgConversionRate: number;
}
```

### A/B Testing Framework

```typescript
async function runSearchOptimizationExperiment(
  experimentConfig: ExperimentConfig,
  duration: number,
): Promise<ExperimentResults> {
  const variants = [
    { id: 'A', topK: 3, scoreThreshold: 0.75 },   // Current
    { id: 'B', topK: 5, scoreThreshold: 0.70 },   // Test 1
    { id: 'C', topK: 3, scoreThreshold: 0.65, rerank: true }, // Test 2
  ];

  const results = await Promise.all(
    variants.map(variant => measureVariant(variant, duration))
  );

  return {
    variants: results,
    winner: selectStatisticalWinner(results),
    insights: generateInsights(results),
  };
}
```

## Recommended Configuration by Scale

### Small Scale (< 500 templates)
```typescript
const config = {
  topK: 5,
  scoreThreshold: 0.65,
  useReranking: false,
  useCaching: false,
  hnsw_m: 16,
  hnsw_ef_construct: 100,
};
```

### Medium Scale (500 - 5,000 templates)
```typescript
const config = {
  topK: 3,
  scoreThreshold: 0.70,
  useReranking: true,   // Worth the cost
  useCaching: true,     // Significant benefit
  hnsw_m: 16,
  hnsw_ef_construct: 200,
};
```

### Large Scale (> 5,000 templates)
```typescript
const config = {
  topK: 3,
  scoreThreshold: 0.75,
  useReranking: true,
  useCaching: true,
  useHybridSearch: true,
  hnsw_m: 24,           // More connections for better recall
  hnsw_ef_construct: 400,
};
```

## Action Plan

### Phase 1: Baseline (Current)
- ✅ Implement basic vector search
- ✅ Default parameters: topK=10, threshold=0.7
- ✅ Metadata filtering

### Phase 2: Dynamic Tuning (Week 8)
- Implement dynamic topK based on context
- Add fallback threshold strategy
- Add hierarchical filtering

### Phase 3: Advanced (Week 9)
- Add reranking with Cohere
- Implement caching layer
- Add query expansion

### Phase 4: Optimization (Week 10)
- Run A/B tests on parameters
- Tune based on production metrics
- Implement hybrid search if needed

## Next Steps

1. Implement dynamic parameter selection functions
2. Add search metrics collection
3. Create A/B testing framework
4. Run initial experiments with different topK and threshold values
5. Measure impact on RAGAS metrics and business KPIs
6. Document winning configurations

## References

- [Qdrant Performance Tuning](https://qdrant.tech/documentation/guides/performance/)
- [HNSW Algorithm](https://arxiv.org/abs/1603.09320)
- [Reranking for RAG](https://txt.cohere.com/rerank/)
- [Hybrid Search](https://qdrant.tech/articles/hybrid-search/)
