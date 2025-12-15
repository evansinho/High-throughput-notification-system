import { Injectable, Logger } from '@nestjs/common';
import { QdrantService } from './qdrant.service';
import { EmbeddingService } from './embedding.service';
import { CacheService } from '../../redis/cache.service';
import {
  VectorSearchQuery,
  VectorSearchResult,
} from '../interfaces/vector.interface';

/**
 * Retrieval Engine Service - Advanced semantic search and retrieval
 *
 * Features:
 * - Semantic search with vector embeddings
 * - Hybrid search (vector + keyword filtering)
 * - Advanced ranking with score normalization
 * - Search result caching for performance
 * - Query expansion for better recall
 * - Re-ranking with custom scoring
 * - Search analytics and monitoring
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly defaultTopK = 10;
  private readonly defaultScoreThreshold = 0.7;
  private readonly cacheTTL = 3600; // 1 hour in seconds
  private readonly maxCachedResults = 50;

  // Analytics
  private totalSearches = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private avgSearchTimeMs = 0;

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly embeddingService: EmbeddingService,
    private readonly cacheService: CacheService,
  ) {
    this.logger.log('Retrieval Engine initialized');
    this.logger.log(`Default topK: ${this.defaultTopK}`);
    this.logger.log(`Default score threshold: ${this.defaultScoreThreshold}`);
    this.logger.log(`Cache TTL: ${this.cacheTTL}s`);
  }

  /**
   * Semantic search - Primary retrieval method
   * Uses vector similarity with optional filters
   */
  async search(query: VectorSearchQuery): Promise<{
    results: VectorSearchResult[];
    metadata: SearchMetadata;
  }> {
    const startTime = Date.now();
    this.totalSearches++;

    try {
      // Check cache first
      const cacheKey = this.getSearchCacheKey(query);
      const cached =
        await this.cacheService.get<VectorSearchResult[]>(cacheKey);

      if (cached) {
        this.cacheHits++;
        const searchTimeMs = Date.now() - startTime;
        this.updateAvgSearchTime(searchTimeMs);

        this.logger.debug(
          `Cache hit for search query: "${query.queryText.substring(0, 50)}..."`,
        );

        return {
          results: cached,
          metadata: {
            totalResults: cached.length,
            searchTimeMs,
            cached: true,
            queryExpanded: false,
            reranked: false,
          },
        };
      }

      this.cacheMisses++;

      // Generate embedding for query
      const embeddingResult = await this.embeddingService.generateEmbedding(
        query.queryText,
      );

      // Perform vector search
      const results = await this.qdrantService.search(
        embeddingResult.embedding,
        {
          ...query,
          topK: query.topK || this.defaultTopK,
          scoreThreshold: query.scoreThreshold || this.defaultScoreThreshold,
        },
      );

      // Normalize scores to 0-1 range
      const normalizedResults = this.normalizeScores(results);

      // Cache results (limit to maxCachedResults to control memory)
      const resultsToCache = normalizedResults.slice(0, this.maxCachedResults);
      await this.cacheService.set(cacheKey, resultsToCache, {
        ttl: this.cacheTTL,
      });

      const searchTimeMs = Date.now() - startTime;
      this.updateAvgSearchTime(searchTimeMs);

      this.logger.log(
        `Search complete: "${query.queryText.substring(0, 50)}..." - ${results.length} results in ${searchTimeMs}ms`,
      );

      return {
        results: normalizedResults,
        metadata: {
          totalResults: normalizedResults.length,
          searchTimeMs,
          cached: false,
          queryExpanded: false,
          reranked: false,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Search failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Hybrid search - Combines vector search with keyword matching
   * First does semantic search, then applies keyword filtering
   */
  async hybridSearch(
    query: VectorSearchQuery,
    keywords: string[],
    options?: {
      keywordBoost?: number; // Boost score if keywords match (default: 1.2)
      requireAllKeywords?: boolean; // Require all keywords vs any (default: false)
    },
  ): Promise<{
    results: VectorSearchResult[];
    metadata: SearchMetadata;
  }> {
    const startTime = Date.now();

    try {
      // First, do semantic search
      const semanticResults = await this.search(query);

      // Apply keyword filtering and boosting
      const keywordBoost = options?.keywordBoost || 1.2;
      const requireAll = options?.requireAllKeywords || false;

      const hybridResults = semanticResults.results
        .filter((result) => {
          const content = result.payload.content.toLowerCase();
          const tags = result.payload.tags.map((tag) => tag.toLowerCase());

          // Check keyword matches
          const matchedKeywords = keywords.filter((keyword) => {
            const lowerKeyword = keyword.toLowerCase();
            return (
              content.includes(lowerKeyword) || tags.includes(lowerKeyword)
            );
          });

          // Filter based on requireAll setting
          if (requireAll && matchedKeywords.length !== keywords.length) {
            return false;
          }

          return true;
        })
        .map((result) => {
          const content = result.payload.content.toLowerCase();
          const tags = result.payload.tags.map((tag) => tag.toLowerCase());

          // Check keyword matches
          const matchedKeywords = keywords.filter((keyword) => {
            const lowerKeyword = keyword.toLowerCase();
            return (
              content.includes(lowerKeyword) || tags.includes(lowerKeyword)
            );
          });

          // Boost score based on keyword matches
          const boostFactor =
            matchedKeywords.length > 0
              ? Math.pow(keywordBoost, matchedKeywords.length)
              : 1;

          return {
            ...result,
            score: Math.min(result.score * boostFactor, 1.0), // Cap at 1.0
            payload: {
              ...result.payload,
              metadata: {
                ...result.payload.metadata,
                matchedKeywords,
                keywordBoost: boostFactor,
              },
            },
          };
        })
        .sort((a, b) => b.score - a.score); // Re-sort by boosted scores

      const searchTimeMs = Date.now() - startTime;

      this.logger.log(
        `Hybrid search complete: ${hybridResults.length} results (from ${semanticResults.results.length}) in ${searchTimeMs}ms`,
      );

      return {
        results: hybridResults,
        metadata: {
          totalResults: hybridResults.length,
          searchTimeMs,
          cached: false,
          queryExpanded: false,
          reranked: true,
          hybridSearch: {
            semanticResults: semanticResults.results.length,
            keywordFiltered: hybridResults.length,
            keywords,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Hybrid search failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Advanced search with query expansion
   * Expands query with synonyms and related terms for better recall
   */
  async searchWithExpansion(
    query: VectorSearchQuery,
    expansionTerms: string[],
  ): Promise<{
    results: VectorSearchResult[];
    metadata: SearchMetadata;
  }> {
    const startTime = Date.now();

    try {
      // Create expanded query by appending expansion terms
      const expandedQuery = `${query.queryText} ${expansionTerms.join(' ')}`;

      this.logger.debug(
        `Query expansion: "${query.queryText}" -> "${expandedQuery}"`,
      );

      // Search with expanded query
      const expandedResults = await this.search({
        ...query,
        queryText: expandedQuery,
      });

      const searchTimeMs = Date.now() - startTime;

      this.logger.log(
        `Search with expansion complete: ${expandedResults.results.length} results in ${searchTimeMs}ms`,
      );

      return {
        results: expandedResults.results,
        metadata: {
          ...expandedResults.metadata,
          searchTimeMs,
          queryExpanded: true,
          expansionTerms,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Search with expansion failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Custom re-ranking with user preferences
   * Apply custom scoring based on user history, preferences, or business rules
   */
  async searchWithReranking(
    query: VectorSearchQuery,
    rerankingFunction: (result: VectorSearchResult) => number,
    options?: {
      topK?: number;
    },
  ): Promise<{
    results: VectorSearchResult[];
    metadata: SearchMetadata;
  }> {
    const startTime = Date.now();

    try {
      // Get initial results (fetch more than needed for reranking)
      const initialTopK = (query.topK || this.defaultTopK) * 3;
      const initialResults = await this.search({
        ...query,
        topK: initialTopK,
      });

      // Apply custom reranking
      const rerankedResults = initialResults.results
        .map((result) => {
          const customScore = rerankingFunction(result);
          // Combine original score with custom score (weighted average)
          const finalScore = result.score * 0.6 + customScore * 0.4;

          return {
            ...result,
            score: finalScore,
            payload: {
              ...result.payload,
              metadata: {
                ...result.payload.metadata,
                originalScore: result.score,
                customScore,
              },
            },
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, options?.topK || query.topK || this.defaultTopK);

      const searchTimeMs = Date.now() - startTime;

      this.logger.log(
        `Search with reranking complete: ${rerankedResults.length} results in ${searchTimeMs}ms`,
      );

      return {
        results: rerankedResults,
        metadata: {
          totalResults: rerankedResults.length,
          searchTimeMs,
          cached: false,
          queryExpanded: false,
          reranked: true,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Search with reranking failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Multi-query search - Search with multiple queries and merge results
   * Useful for complex queries that need different perspectives
   */
  async multiQuerySearch(
    queries: VectorSearchQuery[],
    options?: {
      deduplicateById?: boolean; // Remove duplicate IDs (default: true)
      mergeStrategy?: 'max' | 'avg' | 'sum'; // Score merging strategy (default: max)
    },
  ): Promise<{
    results: VectorSearchResult[];
    metadata: SearchMetadata;
  }> {
    const startTime = Date.now();

    try {
      // Search with all queries in parallel
      const searchPromises = queries.map((query) => this.search(query));
      const allResults = await Promise.all(searchPromises);

      // Merge results
      const deduplicate = options?.deduplicateById ?? true;
      const mergeStrategy = options?.mergeStrategy || 'max';

      const resultMap = new Map<string, VectorSearchResult>();

      for (const { results } of allResults) {
        for (const result of results) {
          const existing = resultMap.get(result.id);

          if (!existing) {
            resultMap.set(result.id, result);
          } else if (deduplicate) {
            // Merge scores based on strategy
            let mergedScore: number;
            switch (mergeStrategy) {
              case 'max':
                mergedScore = Math.max(existing.score, result.score);
                break;
              case 'avg':
                mergedScore = (existing.score + result.score) / 2;
                break;
              case 'sum':
                mergedScore = Math.min(existing.score + result.score, 1.0);
                break;
            }

            resultMap.set(result.id, {
              ...existing,
              score: mergedScore,
            });
          }
        }
      }

      // Convert to array and sort by score
      const mergedResults = Array.from(resultMap.values()).sort(
        (a, b) => b.score - a.score,
      );

      const searchTimeMs = Date.now() - startTime;

      this.logger.log(
        `Multi-query search complete: ${queries.length} queries -> ${mergedResults.length} results in ${searchTimeMs}ms`,
      );

      return {
        results: mergedResults,
        metadata: {
          totalResults: mergedResults.length,
          searchTimeMs,
          cached: false,
          queryExpanded: false,
          reranked: false,
          multiQuery: {
            queries: queries.length,
            mergeStrategy,
            deduplicated: deduplicate,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Multi-query search failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Find similar templates - Given a template ID, find similar templates
   */
  async findSimilar(
    templateId: string,
    options?: {
      topK?: number;
      filter?: VectorSearchQuery['filter'];
      excludeOriginal?: boolean;
    },
  ): Promise<{
    results: VectorSearchResult[];
    metadata: SearchMetadata;
  }> {
    const startTime = Date.now();

    try {
      // Get the original template
      const original = await this.qdrantService.getTemplate(templateId);
      if (!original) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // Search using the template's content
      const results = await this.search({
        queryText: original.content,
        topK: options?.topK || this.defaultTopK + 1, // +1 in case we need to exclude original
        filter: options?.filter,
      });

      // Optionally exclude the original template
      const excludeOriginal = options?.excludeOriginal ?? true;
      let filteredResults = results.results;

      if (excludeOriginal) {
        filteredResults = filteredResults.filter(
          (result) => result.id !== templateId,
        );
      }

      // Trim to requested topK
      filteredResults = filteredResults.slice(
        0,
        options?.topK || this.defaultTopK,
      );

      const searchTimeMs = Date.now() - startTime;

      this.logger.log(
        `Find similar complete: ${filteredResults.length} results for template ${templateId} in ${searchTimeMs}ms`,
      );

      return {
        results: filteredResults,
        metadata: {
          totalResults: filteredResults.length,
          searchTimeMs,
          cached: false,
          queryExpanded: false,
          reranked: false,
          originalTemplateId: templateId,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Find similar failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Normalize scores to 0-1 range
   */
  private normalizeScores(results: VectorSearchResult[]): VectorSearchResult[] {
    if (results.length === 0) return results;

    // For cosine similarity, scores are already in [-1, 1] range
    // We normalize to [0, 1] for consistency
    const minScore = Math.min(...results.map((r) => r.score));
    const maxScore = Math.max(...results.map((r) => r.score));
    const range = maxScore - minScore;

    if (range === 0) {
      // All scores are the same
      return results.map((r) => ({ ...r, score: 1.0 }));
    }

    return results.map((r) => ({
      ...r,
      score: (r.score - minScore) / range,
    }));
  }

  /**
   * Get cache key for search query
   */
  private getSearchCacheKey(query: VectorSearchQuery): string {
    const filterStr = query.filter ? JSON.stringify(query.filter) : 'none';
    const hash = this.simpleHash(`${query.queryText}:${filterStr}`);
    return `search:${hash}:${query.topK || this.defaultTopK}:${query.scoreThreshold || this.defaultScoreThreshold}`;
  }

  /**
   * Simple string hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Update average search time
   */
  private updateAvgSearchTime(searchTimeMs: number): void {
    this.avgSearchTimeMs =
      (this.avgSearchTimeMs * (this.totalSearches - 1) + searchTimeMs) /
      this.totalSearches;
  }

  /**
   * Get retrieval statistics
   */
  getStats(): RetrievalStats {
    return {
      totalSearches: this.totalSearches,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate:
        this.totalSearches > 0 ? this.cacheHits / this.totalSearches : 0,
      avgSearchTimeMs: this.avgSearchTimeMs,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalSearches = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.avgSearchTimeMs = 0;
    this.logger.log('Retrieval statistics reset');
  }

  /**
   * Clear search cache
   */
  async clearCache(): Promise<void> {
    // Note: This would require pattern matching in Redis
    // For now, we just log and let cache expire naturally
    this.logger.warn(
      'Cache clear requested - cache entries will expire naturally',
    );
  }
}

/**
 * Search metadata for analytics
 */
export interface SearchMetadata {
  totalResults: number;
  searchTimeMs: number;
  cached: boolean;
  queryExpanded: boolean;
  reranked: boolean;
  expansionTerms?: string[];
  hybridSearch?: {
    semanticResults: number;
    keywordFiltered: number;
    keywords: string[];
  };
  multiQuery?: {
    queries: number;
    mergeStrategy: 'max' | 'avg' | 'sum';
    deduplicated: boolean;
  };
  originalTemplateId?: string;
}

/**
 * Retrieval statistics
 */
export interface RetrievalStats {
  totalSearches: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  avgSearchTimeMs: number;
}
