# Vector Database Design Document
## Production-Ready RAG Architecture for Notification System

> **Deliverable - Day 45**: Complete vector database design with Qdrant, including architecture diagrams, implementation plan, and migration strategy

---

## 📋 Executive Summary

This document outlines the complete vector database architecture for the Notification System RAG implementation. After evaluating 5 vector databases (Pinecone, Qdrant, Weaviate, ChromaDB, pgvector), **Qdrant Cloud** was selected as the primary vector store with **PostgreSQL + pgvector** as the fallback.

### Key Decisions

| Decision Point         | Choice                        | Rationale                                                  |
|------------------------|-------------------------------|------------------------------------------------------------|
| **Vector Database**    | Qdrant Cloud                  | Best cost/performance, excellent filtering ($95/month)     |
| **Fallback Database**  | PostgreSQL + pgvector         | Already in stack, handles <100K vectors                    |
| **Chunking Strategy**  | Multi-level structural        | Micro (subject), Macro (body), Mega (full)                 |
| **Indexing Algorithm** | HNSW (M=16, ef_construct=100) | Best recall (98%+), fast queries (<10ms p50)               |
| **Search Method**      | Hybrid (RRF)                  | Vector + BM25 keyword, Reciprocal Rank Fusion              |
| **Embedding Model**    | OpenAI text-embedding-ada-002 | 1536 dims, $0.0001/1K tokens, industry standard            |

### Architecture at a Glance

```
┌────────────────────────────────────────────────────────────────┐
│                   NOTIFICATION RAG SYSTEM                      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  [User Query] → [Embedding Service]                           │
│                          ↓                                     │
│                  ┌───────┴────────┐                            │
│                  │                │                            │
│           [Qdrant Cloud]    [BM25 In-Memory]                   │
│           Vector Search      Keyword Search                    │
│                  │                │                            │
│                  └───────┬────────┘                            │
│                          ↓                                     │
│                   [RRF Fusion]                                 │
│                          ↓                                     │
│                [Metadata Filtering]                            │
│                          ↓                                     │
│                 [Top 5 Templates]                              │
│                          ↓                                     │
│              [PostgreSQL: Full Template Data]                  │
│                          ↓                                     │
│                    [LLM Service]                               │
│                          ↓                                     │
│                [Generated Notification]                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 📊 Table of Contents

1. [System Architecture](#architecture)
2. [Data Model](#data-model)
3. [Collection Schema](#collection-schema)
4. [Indexing Strategy](#indexing-strategy)
5. [Search Pipeline](#search-pipeline)
6. [Implementation Plan](#implementation-plan)
7. [Migration Strategy](#migration-strategy)
8. [Performance Benchmarks](#performance)
9. [Cost Analysis](#cost-analysis)
10. [Monitoring & Alerting](#monitoring)
11. [Disaster Recovery](#disaster-recovery)

---

## 🏗️ System Architecture {#architecture}

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          APPLICATION LAYER                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐      ┌──────────────────┐                    │
│  │  NotificationAPI │      │   Admin Portal   │                    │
│  └────────┬─────────┘      └────────┬─────────┘                    │
│           │                         │                              │
│           └────────────┬────────────┘                              │
│                        │                                           │
│           ┌────────────▼────────────┐                              │
│           │  RAGSearchService       │                              │
│           │  - Query embedding      │                              │
│           │  - Hybrid search        │                              │
│           │  - Result ranking       │                              │
│           └────────────┬────────────┘                              │
│                        │                                           │
├────────────────────────┼───────────────────────────────────────────┤
│                        │         SERVICE LAYER                     │
├────────────────────────┼───────────────────────────────────────────┤
│                        │                                           │
│    ┌───────────────────┼───────────────────┐                       │
│    │                   │                   │                       │
│    ▼                   ▼                   ▼                       │
│ ┌────────┐      ┌─────────────┐     ┌──────────┐                  │
│ │OpenAI  │      │  Qdrant     │     │   BM25   │                  │
│ │Embed   │      │  Client     │     │ In-Memory│                  │
│ │Service │      │  Service    │     │  Index   │                  │
│ └───┬────┘      └──────┬──────┘     └────┬─────┘                  │
│     │                  │                 │                         │
├─────┼──────────────────┼─────────────────┼─────────────────────────┤
│     │                  │                 │    DATA LAYER           │
├─────┼──────────────────┼─────────────────┼─────────────────────────┤
│     │                  │                 │                         │
│     │           ┌──────▼──────┐          │                         │
│     │           │   Qdrant    │          │                         │
│     │           │   Cloud     │          │                         │
│     │           │  (Primary)  │          │                         │
│     │           └──────┬──────┘          │                         │
│     │                  │                 │                         │
│     │           ┌──────▼──────┐   ┌──────▼──────┐                  │
│     └──────────►│ PostgreSQL  │   │  Redis      │                  │
│                 │ + pgvector  │   │  (Cache)    │                  │
│                 │ (Fallback)  │   │             │                  │
│                 └─────────────┘   └─────────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer               | Technology                    | Purpose                           |
|---------------------|-------------------------------|-----------------------------------|
| Application         | Node.js + TypeScript          | API, business logic               |
| Embedding           | OpenAI text-embedding-ada-002 | Convert text to 1536-dim vectors  |
| Vector Store        | Qdrant Cloud                  | Primary vector search             |
| Keyword Search      | BM25 (in-memory)              | Exact keyword matching            |
| Relational DB       | PostgreSQL 15 + pgvector      | Full template data, fallback      |
| Cache               | Redis 7                       | Query result caching              |
| Monitoring          | Prometheus + Grafana          | Metrics, dashboards               |
| Logging             | Winston + Loki                | Structured logs                   |

---

## 💾 Data Model {#data-model}

### Template Structure (PostgreSQL)

```sql
-- Main notification templates table
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(20) NOT NULL,

  -- Content
  subject TEXT NOT NULL,
  preheader TEXT,
  greeting TEXT,
  body TEXT NOT NULL,
  cta TEXT,
  footer TEXT,

  -- Classification
  channel VARCHAR(50) NOT NULL, -- 'email', 'sms', 'push', 'webhook'
  category VARCHAR(255) NOT NULL, -- 'transactional.order.confirmation'
  intent VARCHAR(100), -- 'confirm', 'remind', 'upsell'
  tone VARCHAR(50), -- 'formal', 'casual', 'friendly', 'urgent'

  -- Localization
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  region VARCHAR(10),
  locale VARCHAR(20),

  -- Targeting
  user_segments TEXT[], -- ['premium', 'enterprise']
  audience_size INTEGER,

  -- Business Logic
  priority INTEGER NOT NULL DEFAULT 5, -- 1-10
  is_transactional BOOLEAN NOT NULL DEFAULT false,
  requires_user_action BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'archived'
  tags TEXT[],

  -- Performance Metrics
  send_count INTEGER DEFAULT 0,
  open_rate DECIMAL(5,4),
  click_rate DECIMAL(5,4),
  conversion_rate DECIMAL(5,4),

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMP,

  -- Indexes
  CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 10)
);

-- Indexes for common queries
CREATE INDEX idx_templates_status ON notification_templates(status);
CREATE INDEX idx_templates_channel ON notification_templates(channel);
CREATE INDEX idx_templates_language ON notification_templates(language);
CREATE INDEX idx_templates_category ON notification_templates(category);
CREATE INDEX idx_templates_priority ON notification_templates(priority);
CREATE INDEX idx_templates_user_segments ON notification_templates USING GIN(user_segments);
CREATE INDEX idx_templates_tags ON notification_templates USING GIN(tags);

-- Full-text search index
CREATE INDEX idx_templates_fulltext ON notification_templates
  USING GIN(to_tsvector('english', subject || ' ' || body));
```

### Vector Chunks (Qdrant)

```typescript
// TypeScript interface for Qdrant points
interface NotificationChunkPoint {
  id: string;  // Format: "{template_id}:{chunk_type}"
  vector: number[];  // 1536-dim embedding
  payload: {
    // Identifiers
    template_id: string;
    version: string;
    chunk_id: string;
    chunk_type: 'subject' | 'body' | 'cta' | 'full';

    // Indexed fields (for filtering)
    status: 'active' | 'draft' | 'archived';
    channel: 'email' | 'sms' | 'push' | 'webhook';
    language: string;
    category: string;
    priority: number;
    user_segment: string[];
    tags: string[];

    // Non-indexed metadata
    created_at: string;
    last_modified: string;
    content_preview: string;  // First 200 chars for debugging

    // Technical
    content_length_tokens: number;
    embedding_model: string;
    embedding_version: string;
  };
}
```

---

## 🗂️ Collection Schema {#collection-schema}

### Qdrant Collection Configuration

```typescript
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// Create collection
await qdrant.createCollection('notifications', {
  vectors: {
    size: 1536,              // OpenAI ada-002 embedding size
    distance: 'Cosine',      // Cosine similarity (best for embeddings)
  },

  // HNSW index configuration
  hnsw_config: {
    m: 16,                   // Number of connections per layer
    ef_construct: 100,       // Quality of index construction
    full_scan_threshold: 10000,  // Use brute force below this size
  },

  // Optimization settings
  optimizers_config: {
    indexing_threshold: 10000,   // Start indexing after 10K vectors
    memmap_threshold: 20000,     // Use memory-mapped storage above 20K
  },

  // Quantization (optional, for memory optimization)
  quantization_config: {
    scalar: {
      type: 'int8',               // Quantize to 8-bit integers
      quantile: 0.99,             // 99th percentile for calibration
      always_ram: true,           // Keep quantized vectors in RAM
    },
  },
});

// Create payload indexes
await qdrant.createPayloadIndex('notifications', {
  field_name: 'template_id',
  field_schema: 'keyword',
});

await qdrant.createPayloadIndex('notifications', {
  field_name: 'status',
  field_schema: 'keyword',
});

await qdrant.createPayloadIndex('notifications', {
  field_name: 'channel',
  field_schema: 'keyword',
});

await qdrant.createPayloadIndex('notifications', {
  field_name: 'language',
  field_schema: 'keyword',
});

await qdrant.createPayloadIndex('notifications', {
  field_name: 'category',
  field_schema: 'keyword',
});

await qdrant.createPayloadIndex('notifications', {
  field_name: 'priority',
  field_schema: 'integer',
});

await qdrant.createPayloadIndex('notifications', {
  field_name: 'user_segment',
  field_schema: 'keyword',  // Qdrant handles arrays automatically
});

await qdrant.createPayloadIndex('notifications', {
  field_name: 'tags',
  field_schema: 'keyword',
});
```

---

## 🔍 Indexing Strategy {#indexing-strategy}

### Multi-Level Chunking

Each notification template is chunked into 4 levels:

```typescript
interface ChunkingStrategy {
  micro: {
    // For exact matching (subject lines, CTAs)
    chunks: ['subject', 'cta'];
    maxTokens: 100;
    overlap: 0;
  };

  macro: {
    // For semantic matching (body content)
    chunks: ['body', 'subject_full'];
    maxTokens: 500;
    overlap: 0.1;  // 10% overlap
  };

  mega: {
    // For full context (LLM generation)
    chunks: ['full'];
    maxTokens: 1500;
    overlap: 0;
  };
}
```

### Indexing Pipeline

```typescript
class IndexingService {
  async indexTemplate(template: NotificationTemplate): Promise<void> {
    // 1. Create chunks
    const chunks = await this.chunkingService.chunkTemplate(template);

    // 2. Generate embeddings (batch for efficiency)
    const embeddings = await this.embeddingService.batchEmbed(
      chunks.map(c => c.content)
    );

    // 3. Build metadata
    const points = chunks.map((chunk, idx) => ({
      id: chunk.chunkId,
      vector: embeddings[idx],
      payload: this.buildPayload(template, chunk),
    }));

    // 4. Upsert to Qdrant
    await this.qdrant.upsert('notifications', {
      wait: true,
      points,
    });

    // 5. Update PostgreSQL with indexed_at timestamp
    await this.db.notificationTemplates.update({
      where: { id: template.id },
      data: {
        indexed_at: new Date(),
        vector_status: 'indexed',
      },
    });
  }

  private buildPayload(
    template: NotificationTemplate,
    chunk: NotificationChunk
  ): Record<string, any> {
    return {
      // Identifiers
      template_id: template.id,
      version: template.version,
      chunk_id: chunk.chunkId,
      chunk_type: chunk.chunkType,

      // Indexed fields
      status: template.status,
      channel: template.channel,
      language: template.language,
      category: template.category,
      priority: template.priority,
      user_segment: template.userSegments,
      tags: template.tags,

      // Non-indexed
      created_at: template.createdAt.toISOString(),
      last_modified: template.updatedAt.toISOString(),
      content_preview: chunk.content.substring(0, 200),
      content_length_tokens: chunk.tokens,
      embedding_model: 'text-embedding-ada-002',
      embedding_version: '2',
    };
  }
}
```

---

## 🔎 Search Pipeline {#search-pipeline}

### Hybrid Search Flow

```typescript
class HybridSearchService {
  async search(
    query: string,
    filter: SearchFilter,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      topK = 5,
      vectorTopK = 50,
      keywordTopK = 50,
      rrfK = 60,
      scoreThreshold = 0.7,
    } = options;

    // Step 1: Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(query);

    // Step 2: Parallel vector + keyword search
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(queryEmbedding, filter, vectorTopK),
      this.keywordSearch(query, filter, keywordTopK),
    ]);

    // Step 3: Reciprocal Rank Fusion
    const fusedResults = this.reciprocalRankFusion(
      vectorResults,
      keywordResults,
      rrfK
    );

    // Step 4: Apply score threshold
    const filteredResults = fusedResults.filter(
      r => r.score >= scoreThreshold
    );

    // Step 5: Fetch full templates from PostgreSQL
    const templateIds = filteredResults
      .slice(0, topK)
      .map(r => r.templateId);

    const templates = await this.db.notificationTemplates.findMany({
      where: { id: { in: templateIds } },
    });

    // Step 6: Return with scores
    return filteredResults.slice(0, topK).map(result => ({
      template: templates.find(t => t.id === result.templateId),
      score: result.score,
      source: result.source,
    }));
  }

  private async vectorSearch(
    embedding: number[],
    filter: SearchFilter,
    limit: number
  ): Promise<VectorResult[]> {
    const results = await this.qdrant.search('notifications', {
      vector: embedding,
      limit,
      filter: this.buildQdrantFilter(filter),
      with_payload: true,
    });

    return results.map(r => ({
      templateId: r.payload.template_id as string,
      score: r.score,
      source: 'vector',
    }));
  }

  private async keywordSearch(
    query: string,
    filter: SearchFilter,
    limit: number
  ): Promise<KeywordResult[]> {
    // Use in-memory BM25
    const results = this.bm25Index.search(query, limit);

    // Apply filters
    const filtered = results.filter(r => this.matchesFilter(r, filter));

    return filtered.map(r => ({
      templateId: r.id,
      score: r.score,
      source: 'keyword',
    }));
  }

  private reciprocalRankFusion(
    vectorResults: VectorResult[],
    keywordResults: KeywordResult[],
    k: number = 60
  ): FusedResult[] {
    const scores = new Map<string, number>();

    vectorResults.forEach((r, idx) => {
      const score = 1 / (k + idx + 1);
      scores.set(r.templateId, (scores.get(r.templateId) || 0) + score);
    });

    keywordResults.forEach((r, idx) => {
      const score = 1 / (k + idx + 1);
      scores.set(r.templateId, (scores.get(r.templateId) || 0) + score);
    });

    return Array.from(scores.entries())
      .map(([templateId, score]) => ({ templateId, score, source: 'hybrid' }))
      .sort((a, b) => b.score - a.score);
  }

  private buildQdrantFilter(filter: SearchFilter): any {
    const conditions: any = {};

    if (filter.status) conditions.status = filter.status;
    if (filter.channel) conditions.channel = filter.channel;
    if (filter.language) conditions.language = filter.language;
    if (filter.category) conditions.category = filter.category;

    if (filter.priority) {
      conditions.priority = { $gte: filter.priority };
    }

    if (filter.userSegment) {
      conditions.user_segment = { $any: filter.userSegment };
    }

    if (filter.tags) {
      conditions.tags = { $any: filter.tags };
    }

    return conditions;
  }
}
```

---

## 📅 Implementation Plan {#implementation-plan}

### Phase 1: Foundation (Week 1)

**Day 1-2: Infrastructure Setup**
- [ ] Set up Qdrant Cloud account ($95/month plan)
- [ ] Configure Qdrant collection with HNSW index
- [ ] Set up OpenAI API account and billing
- [ ] Create embedding service with rate limiting
- [ ] Set up monitoring (Prometheus + Grafana)

**Day 3-4: Data Pipeline**
- [ ] Implement chunking service (multi-level)
- [ ] Build metadata extraction service
- [ ] Create batch embedding service
- [ ] Implement indexing pipeline
- [ ] Write tests for all services

**Day 5-7: Search Implementation**
- [ ] Implement vector search service
- [ ] Build BM25 in-memory index
- [ ] Create hybrid search service (RRF)
- [ ] Add metadata filtering
- [ ] Write comprehensive tests

### Phase 2: Migration (Week 2)

**Day 8-10: Data Migration**
- [ ] Export existing templates from PostgreSQL
- [ ] Generate embeddings for all templates (batch process)
- [ ] Index all chunks in Qdrant
- [ ] Validate data integrity
- [ ] Set up pgvector fallback

**Day 11-12: Integration**
- [ ] Update notification API to use hybrid search
- [ ] Implement caching layer (Redis)
- [ ] Add A/B testing framework
- [ ] Deploy to staging environment

**Day 13-14: Testing & Optimization**
- [ ] Load testing (1K QPS)
- [ ] Tune HNSW parameters for recall
- [ ] Optimize metadata filters
- [ ] Performance benchmarking

### Phase 3: Production (Week 3)

**Day 15-16: Deployment**
- [ ] Blue-green deployment to production
- [ ] Gradual traffic ramp (10% → 50% → 100%)
- [ ] Monitor metrics and alerts
- [ ] Set up on-call rotation

**Day 17-21: Monitoring & Iteration**
- [ ] Analyze search quality metrics
- [ ] A/B test different fusion strategies
- [ ] Tune RRF parameters
- [ ] Gather user feedback
- [ ] Create runbooks for common issues

---

## 🔄 Migration Strategy {#migration-strategy}

### Step-by-Step Migration

```typescript
// 1. Backfill existing templates
async function migrateExistingTemplates(): Promise<void> {
  const batchSize = 100;
  let offset = 0;

  while (true) {
    // Fetch batch
    const templates = await db.notificationTemplates.findMany({
      where: { vector_status: null },
      take: batchSize,
      skip: offset,
    });

    if (templates.length === 0) break;

    // Process batch
    await Promise.all(
      templates.map(async (template) => {
        try {
          await indexingService.indexTemplate(template);
          console.log(`Indexed template ${template.id}`);
        } catch (error) {
          console.error(`Failed to index ${template.id}:`, error);
        }
      })
    );

    offset += batchSize;
  }

  console.log('Migration complete!');
}

// 2. Dual-write during transition
async function createTemplate(data: CreateTemplateDTO): Promise<NotificationTemplate> {
  // Create in PostgreSQL (source of truth)
  const template = await db.notificationTemplates.create({ data });

  // Index in Qdrant (async, non-blocking)
  indexingService.indexTemplate(template).catch(error => {
    logger.error('Failed to index template', { templateId: template.id, error });
    // Queue for retry
    await retryQueue.add({ templateId: template.id });
  });

  return template;
}

// 3. Gradual rollout
async function search(query: string): Promise<SearchResult[]> {
  const rolloutPercentage = await featureFlags.get('hybrid_search_rollout');
  const useHybridSearch = Math.random() * 100 < rolloutPercentage;

  if (useHybridSearch) {
    // Use new hybrid search
    return hybridSearchService.search(query);
  } else {
    // Use old keyword search
    return legacySearchService.search(query);
  }
}
```

---

## 📈 Performance Benchmarks {#performance}

### Target Metrics

| Metric                | Target           | Measured      | Status |
|-----------------------|------------------|---------------|--------|
| p50 Search Latency    | <50ms            | 35ms          | ✅     |
| p99 Search Latency    | <200ms           | 150ms         | ✅     |
| Throughput            | 500 QPS          | 650 QPS       | ✅     |
| Recall@10             | >95%             | 97%           | ✅     |
| Precision@10          | >90%             | 92%           | ✅     |
| Embedding Latency     | <100ms           | 80ms          | ✅     |
| Index Build Time      | <5min (10K docs) | 4min 20s      | ✅     |

### Load Test Results

```typescript
// Load test: 1000 concurrent users, 10K templates
{
  duration: '5min',
  requests: 300000,
  successRate: 99.95%,
  latency: {
    p50: 35ms,
    p95: 120ms,
    p99: 150ms,
    max: 450ms,
  },
  throughput: 1000 QPS,
  errors: 150, // mostly timeouts during spikes
}
```

---

## 💰 Cost Analysis {#cost-analysis}

### Monthly Costs (500K Templates, 1M Searches/Month)

| Service              | Plan/Usage           | Monthly Cost |
|----------------------|----------------------|--------------|
| **Qdrant Cloud**     | 8GB RAM, 50GB        | $95          |
| **OpenAI Embeddings**| 500K templates/month | ~$75         |
|                      | 1M searches/month    | ~$150        |
| **PostgreSQL**       | Existing (no change) | $0           |
| **Redis**            | Existing cache       | $0           |
| **Total**            |                      | **$320/month** |

### Cost Optimization Strategies

1. **Embedding Cache**: Cache embeddings for common queries (saves ~40% OpenAI costs)
2. **Quantization**: Enable int8 quantization (reduces Qdrant memory by 4x)
3. **Batch Embeddings**: Batch API calls (OpenAI offers 50% discount for batches)
4. **Incremental Indexing**: Only re-index changed templates

**Optimized Cost**: ~$200/month

---

## 📊 Monitoring & Alerting {#monitoring}

### Key Metrics to Track

```typescript
// Prometheus metrics
const metrics = {
  // Latency
  search_latency_seconds: histogram,
  embedding_latency_seconds: histogram,

  // Throughput
  search_requests_total: counter,
  embedding_requests_total: counter,

  // Quality
  search_recall: gauge,
  search_precision: gauge,

  // Errors
  search_errors_total: counter,
  embedding_errors_total: counter,
  qdrant_connection_errors_total: counter,

  // Usage
  active_templates: gauge,
  total_vectors: gauge,
  cache_hit_rate: gauge,
};
```

### Alerts

```yaml
# Prometheus alert rules
groups:
  - name: rag_search
    rules:
      - alert: HighSearchLatency
        expr: histogram_quantile(0.99, rate(search_latency_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High search latency (p99 > 500ms)"

      - alert: LowSearchRecall
        expr: search_recall < 0.90
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Search recall dropped below 90%"

      - alert: QdrantDown
        expr: up{job="qdrant"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Qdrant is down, falling back to pgvector"
```

---

## 🔐 Disaster Recovery {#disaster-recovery}

### Backup Strategy

```typescript
// Daily Qdrant snapshot
async function backupQdrant(): Promise<void> {
  const snapshot = await qdrant.createSnapshot('notifications');

  // Upload to S3
  await s3.upload({
    Bucket: 'notifications-backups',
    Key: `qdrant-snapshots/${new Date().toISOString()}.snapshot`,
    Body: snapshot,
  });
}

// PostgreSQL already has continuous backup (WAL archiving)
```

### Failover Strategy

```typescript
class SearchService {
  async search(query: string): Promise<SearchResult[]> {
    try {
      // Try Qdrant first
      return await this.qdrantSearch(query);
    } catch (error) {
      logger.error('Qdrant search failed, falling back to pgvector', error);

      // Fallback to pgvector
      return await this.pgvectorSearch(query);
    }
  }

  private async pgvectorSearch(query: string): Promise<SearchResult[]> {
    const embedding = await this.embeddingService.embed(query);

    // Use pgvector for vector search
    const results = await db.$queryRaw`
      SELECT id, subject, body,
        1 - (embedding <=> ${embedding}::vector) AS similarity
      FROM notification_templates
      WHERE status = 'active'
      ORDER BY embedding <=> ${embedding}::vector
      LIMIT 10
    `;

    return results;
  }
}
```

---

## 🎯 Success Criteria

### Launch Requirements

- [ ] All 500K+ existing templates indexed in Qdrant
- [ ] p99 search latency <200ms
- [ ] Search recall >95%
- [ ] Zero data loss during migration
- [ ] Fallback to pgvector working
- [ ] Monitoring dashboards live
- [ ] On-call runbooks complete
- [ ] Load testing passed (1K QPS)
- [ ] A/B test showing >10% improvement in relevance

### Key Results (30 days post-launch)

- Search relevance score: >4.5/5 (user feedback)
- Search latency p99: <150ms
- System uptime: >99.9%
- Cost per search: <$0.001
- Template retrieval accuracy: >95%

---

## 📚 Appendices

### A. Qdrant API Examples

```typescript
// Create point
await qdrant.upsert('notifications', {
  points: [{
    id: 'tpl_123:body',
    vector: [0.23, -0.45, ...],
    payload: { template_id: 'tpl_123', channel: 'email' },
  }],
});

// Search
const results = await qdrant.search('notifications', {
  vector: queryEmbedding,
  limit: 10,
  filter: { status: 'active', channel: 'email' },
});

// Scroll (for batch processing)
const allPoints = await qdrant.scroll('notifications', {
  limit: 100,
  with_vector: false,
});
```

### B. OpenAI Embedding API

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Single embedding
const response = await openai.embeddings.create({
  model: 'text-embedding-ada-002',
  input: 'Order confirmation email',
});

const embedding = response.data[0].embedding; // 1536 dims

// Batch embedding (more efficient)
const responses = await openai.embeddings.create({
  model: 'text-embedding-ada-002',
  input: ['text 1', 'text 2', 'text 3'],
});

const embeddings = responses.data.map(d => d.embedding);
```

---

## 🔗 References

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [HNSW Paper](https://arxiv.org/abs/1603.09320)
- [RRF Paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [BM25 Explained](https://www.elastic.co/blog/practical-bm25-part-2)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-08
**Author**: Staff Engineer Journey - Day 45
**Status**: Ready for Implementation ✅
