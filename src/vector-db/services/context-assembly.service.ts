import { Injectable, Logger } from '@nestjs/common';
import { VectorSearchResult } from '../interfaces/vector.interface';

/**
 * Context Assembly Service - Manages context window and prompt assembly
 *
 * Features:
 * - Context window management (8K tokens max)
 * - Relevance scoring and filtering
 * - Context compression (deduplication, summarization)
 * - Prompt assembly with retrieved context
 * - Token counting and budget management
 * - Template ranking with diversity
 * - Metadata-based filtering
 */
@Injectable()
export class ContextAssemblyService {
  private readonly logger = new Logger(ContextAssemblyService.name);

  // Context window configuration
  private readonly maxContextTokens = 8000; // Reserve for context
  private readonly maxPromptTokens = 1000; // Reserve for user prompt
  private readonly maxCompletionTokens = 1000; // Reserve for completion
  private readonly avgTokensPerChar = 0.25; // Approximation: 1 token ≈ 4 chars

  // Relevance thresholds
  private readonly minRelevanceScore = 0.5;
  private readonly diversityWeight = 0.3; // Balance between relevance and diversity

  // Statistics
  private totalAssemblies = 0;
  private totalTokensUsed = 0;
  private avgContextSize = 0;

  constructor() {
    this.logger.log('Context Assembly Service initialized');
    this.logger.log(`Max context tokens: ${this.maxContextTokens}`);
    this.logger.log(`Min relevance score: ${this.minRelevanceScore}`);
  }

  /**
   * Assemble context from search results
   * Main entry point for context assembly
   */
  async assembleContext(
    results: VectorSearchResult[],
    userQuery: string,
    options?: AssemblyOptions,
  ): Promise<AssembledContext> {
    const startTime = Date.now();
    this.totalAssemblies++;

    try {
      // Step 1: Filter by relevance score
      const relevantResults = this.filterByRelevance(
        results,
        options?.minScore ?? this.minRelevanceScore,
      );

      this.logger.debug(
        `Filtered to ${relevantResults.length} relevant results (from ${results.length})`,
      );

      // Step 2: Remove duplicates and near-duplicates
      const deduplicatedResults = this.deduplicateResults(
        relevantResults,
        options?.similarityThreshold ?? 0.95,
      );

      this.logger.debug(
        `Deduplicated to ${deduplicatedResults.length} unique results`,
      );

      // Step 3: Rank by relevance with diversity
      const rankedResults = this.rankWithDiversity(
        deduplicatedResults,
        options?.diversityWeight ?? this.diversityWeight,
      );

      // Step 4: Fit into context window
      const { selectedResults, totalTokens } = this.fitToContextWindow(
        rankedResults,
        options?.maxTokens ?? this.maxContextTokens,
      );

      this.logger.debug(
        `Selected ${selectedResults.length} results (${totalTokens} tokens)`,
      );

      // Step 5: Assemble prompt
      const prompt = this.assemblePrompt(
        userQuery,
        selectedResults,
        options?.systemPrompt,
      );

      const assemblyTimeMs = Date.now() - startTime;

      // Update statistics
      this.totalTokensUsed += totalTokens;
      this.avgContextSize =
        (this.avgContextSize * (this.totalAssemblies - 1) +
          selectedResults.length) /
        this.totalAssemblies;

      this.logger.log(
        `Context assembled: ${selectedResults.length} templates, ${totalTokens} tokens, ${assemblyTimeMs}ms`,
      );

      return {
        prompt,
        context: selectedResults,
        metadata: {
          totalResults: results.length,
          relevantResults: relevantResults.length,
          deduplicatedResults: deduplicatedResults.length,
          selectedResults: selectedResults.length,
          totalTokens,
          maxTokens: options?.maxTokens ?? this.maxContextTokens,
          utilizationPercent:
            (totalTokens / (options?.maxTokens ?? this.maxContextTokens)) * 100,
          assemblyTimeMs,
          compressed: deduplicatedResults.length < relevantResults.length,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Context assembly failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Filter results by relevance score
   */
  private filterByRelevance(
    results: VectorSearchResult[],
    minScore: number,
  ): VectorSearchResult[] {
    return results.filter((result) => result.score >= minScore);
  }

  /**
   * Remove duplicate and near-duplicate results
   * Uses content similarity to identify duplicates
   */
  private deduplicateResults(
    results: VectorSearchResult[],
    similarityThreshold: number,
  ): VectorSearchResult[] {
    const deduplicated: VectorSearchResult[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      // Check exact duplicates by ID
      if (seen.has(result.id)) {
        continue;
      }

      // Check near-duplicates by content similarity
      let isDuplicate = false;
      for (const existing of deduplicated) {
        const similarity = this.calculateContentSimilarity(
          result.payload.content,
          existing.payload.content,
        );

        if (similarity >= similarityThreshold) {
          isDuplicate = true;
          this.logger.debug(
            `Near-duplicate detected: ${result.id} similar to ${existing.id} (${similarity.toFixed(2)})`,
          );
          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(result);
        seen.add(result.id);
      }
    }

    return deduplicated;
  }

  /**
   * Calculate content similarity using Jaccard index
   * Fast approximation without needing embeddings
   */
  private calculateContentSimilarity(
    content1: string,
    content2: string,
  ): number {
    // Tokenize into words
    const tokens1 = new Set(
      content1
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );
    const tokens2 = new Set(
      content2
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );

    // Jaccard similarity: |A ∩ B| / |A ∪ B|
    const intersection = new Set(
      [...tokens1].filter((token) => tokens2.has(token)),
    );
    const union = new Set([...tokens1, ...tokens2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Rank results with diversity
   * Uses Maximal Marginal Relevance (MMR) algorithm
   */
  private rankWithDiversity(
    results: VectorSearchResult[],
    diversityWeight: number,
  ): VectorSearchResult[] {
    if (results.length <= 1) {
      return results;
    }

    const ranked: VectorSearchResult[] = [];
    const remaining = [...results];

    // Start with highest scoring result
    remaining.sort((a, b) => b.score - a.score);
    ranked.push(remaining.shift()!);

    // Iteratively select results that balance relevance and diversity
    while (remaining.length > 0) {
      let maxMmr = -Infinity;
      let maxIndex = 0;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // Relevance score (already normalized)
        const relevance = candidate.score;

        // Diversity score (max similarity to already selected)
        let maxSimilarity = 0;
        for (const selected of ranked) {
          const similarity = this.calculateContentSimilarity(
            candidate.payload.content,
            selected.payload.content,
          );
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        // MMR = λ * Relevance - (1-λ) * MaxSimilarity
        const mmr =
          (1 - diversityWeight) * relevance - diversityWeight * maxSimilarity;

        if (mmr > maxMmr) {
          maxMmr = mmr;
          maxIndex = i;
        }
      }

      ranked.push(remaining.splice(maxIndex, 1)[0]);
    }

    return ranked;
  }

  /**
   * Fit results into context window
   * Selects results until token budget is exhausted
   */
  private fitToContextWindow(
    results: VectorSearchResult[],
    maxTokens: number,
  ): { selectedResults: VectorSearchResult[]; totalTokens: number } {
    const selected: VectorSearchResult[] = [];
    let totalTokens = 0;

    for (const result of results) {
      const tokens = this.estimateTokens(result.payload.content);

      // Reserve some tokens for formatting (template separators, etc.)
      const tokensWithOverhead = tokens + 10;

      if (totalTokens + tokensWithOverhead > maxTokens) {
        this.logger.debug(
          `Stopped at ${selected.length} results (token budget exhausted)`,
        );
        break;
      }

      selected.push(result);
      totalTokens += tokensWithOverhead;
    }

    return { selectedResults: selected, totalTokens };
  }

  /**
   * Estimate token count for text
   * Uses character-based approximation (1 token ≈ 4 chars)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length * this.avgTokensPerChar);
  }

  /**
   * Assemble final prompt with context
   */
  private assemblePrompt(
    userQuery: string,
    context: VectorSearchResult[],
    systemPrompt?: string,
  ): string {
    const parts: string[] = [];

    // System prompt
    if (systemPrompt) {
      parts.push(systemPrompt);
      parts.push('');
    }

    // Default system prompt if none provided
    if (!systemPrompt) {
      parts.push(
        "You are a helpful notification generation assistant. Use the provided template examples to generate a notification that matches the user's requirements.",
      );
      parts.push('');
    }

    // Context section
    if (context.length > 0) {
      parts.push('# Template Examples');
      parts.push('');
      parts.push(
        'Here are some relevant notification templates to guide your response:',
      );
      parts.push('');

      context.forEach((result, index) => {
        parts.push(
          `## Template ${index + 1} (Score: ${result.score.toFixed(2)})`,
        );
        parts.push(`**Channel:** ${result.payload.channel}`);
        parts.push(`**Category:** ${result.payload.category}`);
        parts.push(`**Tone:** ${result.payload.tone}`);
        parts.push(`**Language:** ${result.payload.language}`);
        if (result.payload.tags.length > 0) {
          parts.push(`**Tags:** ${result.payload.tags.join(', ')}`);
        }
        parts.push('');
        parts.push('**Content:**');
        parts.push(result.payload.content);
        parts.push('');
        parts.push('---');
        parts.push('');
      });
    }

    // User query
    parts.push('# User Request');
    parts.push('');
    parts.push(userQuery);

    return parts.join('\n');
  }

  /**
   * Compress context by removing redundant information
   * Advanced compression with summarization hints
   */
  async compressContext(
    results: VectorSearchResult[],
    targetReduction: number, // 0.0 to 1.0 (e.g., 0.3 = reduce by 30%)
  ): Promise<VectorSearchResult[]> {
    if (targetReduction <= 0 || results.length === 0) {
      return results;
    }

    const targetCount = Math.ceil(results.length * (1 - targetReduction));

    // Use MMR to select most diverse subset
    const compressed = this.rankWithDiversity(results, 0.5); // High diversity

    return compressed.slice(0, targetCount);
  }

  /**
   * Calculate context diversity score
   * Higher score = more diverse templates
   */
  calculateContextDiversity(results: VectorSearchResult[]): number {
    if (results.length <= 1) {
      return 1.0;
    }

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const similarity = this.calculateContentSimilarity(
          results[i].payload.content,
          results[j].payload.content,
        );
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    const avgSimilarity = totalSimilarity / comparisons;
    return 1 - avgSimilarity; // Diversity = 1 - similarity
  }

  /**
   * Calculate context coverage
   * How well does the context cover different aspects (channels, categories, tones)
   */
  calculateContextCoverage(results: VectorSearchResult[]): ContextCoverage {
    const channels = new Set(results.map((r) => r.payload.channel));
    const categories = new Set(results.map((r) => r.payload.category));
    const tones = new Set(results.map((r) => r.payload.tone));
    const languages = new Set(results.map((r) => r.payload.language));
    const tags = new Set(results.flatMap((r) => r.payload.tags));

    return {
      channels: channels.size,
      categories: categories.size,
      tones: tones.size,
      languages: languages.size,
      uniqueTags: tags.size,
      totalTemplates: results.length,
    };
  }

  /**
   * Get assembly statistics
   */
  getStats(): AssemblyStats {
    return {
      totalAssemblies: this.totalAssemblies,
      totalTokensUsed: this.totalTokensUsed,
      avgContextSize: this.avgContextSize,
      avgTokensPerAssembly:
        this.totalAssemblies > 0
          ? this.totalTokensUsed / this.totalAssemblies
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalAssemblies = 0;
    this.totalTokensUsed = 0;
    this.avgContextSize = 0;
    this.logger.log('Context assembly statistics reset');
  }

  /**
   * Get configuration
   */
  getConfig(): ContextConfig {
    return {
      maxContextTokens: this.maxContextTokens,
      maxPromptTokens: this.maxPromptTokens,
      maxCompletionTokens: this.maxCompletionTokens,
      minRelevanceScore: this.minRelevanceScore,
      diversityWeight: this.diversityWeight,
      avgTokensPerChar: this.avgTokensPerChar,
    };
  }
}

/**
 * Assembly options
 */
export interface AssemblyOptions {
  maxTokens?: number;
  minScore?: number;
  diversityWeight?: number;
  similarityThreshold?: number;
  systemPrompt?: string;
}

/**
 * Assembled context result
 */
export interface AssembledContext {
  prompt: string;
  context: VectorSearchResult[];
  metadata: AssemblyMetadata;
}

/**
 * Assembly metadata
 */
export interface AssemblyMetadata {
  totalResults: number;
  relevantResults: number;
  deduplicatedResults: number;
  selectedResults: number;
  totalTokens: number;
  maxTokens: number;
  utilizationPercent: number;
  assemblyTimeMs: number;
  compressed: boolean;
}

/**
 * Context coverage metrics
 */
export interface ContextCoverage {
  channels: number;
  categories: number;
  tones: number;
  languages: number;
  uniqueTags: number;
  totalTemplates: number;
}

/**
 * Assembly statistics
 */
export interface AssemblyStats {
  totalAssemblies: number;
  totalTokensUsed: number;
  avgContextSize: number;
  avgTokensPerAssembly: number;
}

/**
 * Context configuration
 */
export interface ContextConfig {
  maxContextTokens: number;
  maxPromptTokens: number;
  maxCompletionTokens: number;
  minRelevanceScore: number;
  diversityWeight: number;
  avgTokensPerChar: number;
}
