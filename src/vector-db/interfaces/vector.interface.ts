/**
 * Vector DB interfaces for notification templates
 */

export interface NotificationTemplate {
  id: string;
  content: string;
  channel: 'email' | 'sms' | 'push';
  category: 'transactional' | 'marketing' | 'system';
  tone: string;
  language: string;
  tags: string[];
  metadata?: Record<string, any>;
}

export interface VectorSearchQuery {
  queryText: string;
  topK?: number;
  filter?: VectorFilter;
  scoreThreshold?: number;
}

export interface VectorFilter {
  channel?: 'email' | 'sms' | 'push';
  category?: 'transactional' | 'marketing' | 'system';
  tone?: string;
  language?: string;
  tags?: string[];
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: NotificationTemplate;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  cached?: boolean;
}

export interface EmbeddingBatchResult {
  results: EmbeddingResult[];
  totalTexts: number;
  cacheHits: number;
  cacheMisses: number;
  processingTimeMs: number;
  stats: EmbeddingStats;
}

export interface EmbeddingStats {
  totalTokensProcessed: number;
  totalCost: number;
  model: string;
  dimensions: number;
}

export interface CollectionInfo {
  name: string;
  vectorSize: number;
  distance: 'Cosine' | 'Euclid' | 'Dot';
  pointsCount: number;
  status: string;
}
