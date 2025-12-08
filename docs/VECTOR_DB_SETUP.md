# Vector Database Setup - Implementation Notes

## Overview
This document summarizes the vector database implementation completed on Day 48, including the setup, fixes, and testing results.

## Implementation Summary

### Infrastructure
- **Vector DB**: Qdrant v1.12.1 running in Docker
- **Ports**: REST API (6333), gRPC API (6334)
- **Collection**: `notification_templates`
- **Vector Dimensions**: 1536 (standard for text embedding models)
- **Distance Metric**: Cosine similarity
- **Volume**: `qdrant_data` for persistence

### Services Implemented

#### QdrantService (`src/vector-db/services/qdrant.service.ts`)
- Automatic collection creation with proper schema
- Payload indexes for fast filtering: channel, category, tone, language
- CRUD operations: upsert, batch upsert, search, delete, retrieve
- Collection management and statistics
- Metadata filtering support

#### EmbeddingService (`src/vector-db/services/embedding.service.ts`)
- Mock implementation using deterministic hash-based embeddings
- Generates 1536-dimensional unit vectors (L2 normalized)
- Production notes included for: OpenAI, Voyage AI, local transformers
- Cosine similarity calculation utility

#### VectorDbController (`src/vector-db/vector-db.controller.ts`)
8 REST API endpoints:
1. `POST /vector-db/templates` - Upload single template
2. `POST /vector-db/templates/batch` - Batch upload
3. `POST /vector-db/search` - Similarity search with filters
4. `GET /vector-db/collection/info` - Collection statistics
5. `GET /vector-db/templates/:id` - Retrieve specific template
6. `DELETE /vector-db/templates/:id` - Delete template
7. `GET /vector-db/templates/count` - Count templates
8. `DELETE /vector-db/collection/clear` - Clear collection (testing)

## Issues Fixed

### Issue 1: Qdrant UUID Requirement
**Problem**: Qdrant v1.12.1 only accepts UUIDs or unsigned integers as point IDs, not arbitrary strings.

**Error Message**:
```
Format error in JSON body: value test-123 is not a valid point ID,
valid values are either an unsigned integer or a UUID
```

**Solution**:
- Replaced all `uuid` package imports with Node.js built-in `crypto.randomUUID()`
- Updated files:
  - `src/vector-db/test-vector-db.ts`
  - `src/vector-db/vector-db.controller.ts`
  - `src/ai/ai.controller.ts`

**Why This Works**:
- `crypto.randomUUID()` is a native Node.js function (v14.17.0+)
- No ESM/CommonJS compatibility issues
- Generates proper RFC 4122 v4 UUIDs
- No external dependencies needed

### Issue 2: Score Threshold Falsy Value Bug
**Problem**: Using `||` operator for score threshold caused 0.0 to be treated as falsy, defaulting to 0.7

**Code Before**:
```typescript
score_threshold: query.scoreThreshold || 0.7
```

**Code After**:
```typescript
score_threshold: query.scoreThreshold ?? 0.7
```

**Impact**: Now allows setting threshold to 0.0 for mock embeddings testing

### Issue 3: Test Script Accumulating Duplicates
**Problem**: Running test multiple times accumulated duplicate templates in collection

**Solution**: Added collection clearing step at start of test script
```typescript
// Clean up: Clear collection before testing
console.log('Preparing test environment...');
await qdrantService.clearCollection();
console.log('✅ Collection cleared\n');
```

## Test Results

All 7 tests passing:

### Test 1: Collection Information
```
✅ Collection: {
  name: 'notification_templates',
  vectorSize: 1536,
  distance: 'Cosine',
  pointsCount: 0,
  status: 'green'
}
```

### Test 2: Embedding Generation
```
✅ Generated 3 embeddings
   Dimensions: 1536
   Model: mock-embedding-model-v1
```

### Test 3: Template Upload
```
✅ Uploaded 5 templates
```

### Test 4: Similarity Search
```
Query: "I forgot my password and need to reset it"
Found 3 similar templates:
  1. Template ID: d503b0c4-af13-419e-aca1-be2c80e03bd9
     Score: 0.5286
     Content: Hi {{user_name}}, you requested to reset your password...
     Tags: security, password-reset
```

### Test 5: Filtered Search
```
Query: "order notification"
Filter: category=transactional, channel=email
Found 1 matching templates:
  1. Your order {{order_number}} has been shipped...
     Score: 0.5620
     Tags: order, shipping
```

### Test 6: Template Count
```
✅ Total templates in collection: 5
```

### Test 7: Template Retrieval
```
✅ Retrieved template:
   ID: d503b0c4-af13-419e-aca1-be2c80e03bd9
   Content: Hi {{user_name}}, you requested to reset your password...
   Tags: security, password-reset
```

## Running the Tests

```bash
# Start Qdrant if not running
docker-compose up -d qdrant

# Run test script
npx ts-node src/vector-db/test-vector-db.ts
```

## Mock Embeddings vs Production

### Current Implementation (Mock)
- Deterministic hash-based vectors
- No API costs during development
- Same input always produces same embedding
- Not semantically meaningful (similarity scores are random)
- Good for testing infrastructure

### Production Options

#### Option 1: OpenAI
```typescript
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const response = await openai.embeddings.create({
  input: text,
  model: 'text-embedding-3-small', // $0.02 per 1M tokens
});
return response.data[0].embedding;
```

#### Option 2: Voyage AI (Anthropic Recommended)
```typescript
import { VoyageAIClient } from '@voyageai/voyage';

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
const response = await voyage.embed({
  texts: [text],
  model: 'voyage-2', // 1024 dimensions
});
return response.embeddings[0];
```

#### Option 3: Local Model
```typescript
import { pipeline } from '@xenova/transformers';

const extractor = await pipeline('feature-extraction',
  'Xenova/all-MiniLM-L6-v2'); // 384 dimensions
const output = await extractor(text, { pooling: 'mean', normalize: true });
return Array.from(output.data);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VectorDbController                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  POST /templates       - Upload template              │  │
│  │  POST /templates/batch - Batch upload                 │  │
│  │  POST /search          - Similarity search            │  │
│  │  GET  /templates/:id   - Retrieve template            │  │
│  │  DELETE /templates/:id - Delete template              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │                            │
        ▼                            ▼
┌───────────────┐           ┌────────────────┐
│ QdrantService │           │EmbeddingService│
│               │           │                │
│ • Collection  │           │ • Generate     │
│ • CRUD Ops    │           │   Embeddings   │
│ • Search      │           │ • Mock/Prod    │
│ • Filtering   │           │   Modes        │
└───────┬───────┘           └────────────────┘
        │
        ▼
┌───────────────┐
│ Qdrant v1.12.1│
│               │
│ • REST: 6333  │
│ • gRPC: 6334  │
│ • 1536 dims   │
│ • Cosine      │
└───────────────┘
```

## Schema

### NotificationTemplate Interface
```typescript
interface NotificationTemplate {
  id: string;                              // UUID v4
  content: string;                         // Template text with {{variables}}
  channel: 'email' | 'sms' | 'push';      // Delivery channel
  category: 'transactional' | 'marketing' | 'system';
  tone: string;                            // e.g., 'friendly', 'professional', 'urgent'
  language: string;                        // ISO language code
  tags: string[];                          // Searchable tags
  metadata?: Record<string, any>;          // Additional metadata
}
```

### VectorSearchQuery Interface
```typescript
interface VectorSearchQuery {
  queryText: string;                       // Text to search for
  topK?: number;                          // Number of results (default: 10)
  filter?: VectorFilter;                  // Metadata filters
  scoreThreshold?: number;                // Minimum similarity (default: 0.7)
}
```

## Next Steps (Day 49 - Buffer Day)

1. Experiment with different embedding models
2. Test prompt variations for better template matching
3. Optimize vector search parameters
4. Consider implementing:
   - Hybrid search (vector + keyword)
   - Reranking for better results
   - Template versioning
5. Production embedding service integration

## Total Implementation

- **Lines of Code**: ~1,200
- **Files Created**: 6
- **Docker Services**: 1 (Qdrant)
- **API Endpoints**: 8
- **Test Coverage**: 7 comprehensive tests

## References

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [Qdrant JS Client](https://github.com/qdrant/qdrant-js)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Voyage AI](https://www.voyageai.com/)
- [Transformers.js](https://huggingface.co/docs/transformers.js)