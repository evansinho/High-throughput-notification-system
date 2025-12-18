import { Injectable, Logger, Optional } from '@nestjs/common';
import { LLMService } from './llm.service';
import { RetrievalService } from '../../vector-db/services/retrieval.service';
import { ContextAssemblyService } from '../../vector-db/services/context-assembly.service';
import { VectorSearchResult } from '../../vector-db/interfaces/vector.interface';
import { AIObservabilityService } from './ai-observability.service';
import { PromptCompressionService } from './prompt-compression.service';

/**
 * RAG Generation Service - Combines retrieval and generation
 *
 * Features:
 * - Complete RAG pipeline (retrieve → assemble → generate)
 * - Streaming response support
 * - Source citation tracking
 * - Configurable generation parameters
 * - Quality monitoring
 */
@Injectable()
export class RAGGenerationService {
  private readonly logger = new Logger(RAGGenerationService.name);

  // Statistics
  private totalGenerations = 0;
  private totalTokensUsed = 0;
  private avgGenerationTimeMs = 0;

  constructor(
    private readonly llmService: LLMService,
    private readonly retrievalService: RetrievalService,
    private readonly contextAssemblyService: ContextAssemblyService,
    @Optional() private readonly observabilityService?: AIObservabilityService,
    @Optional() private readonly compressionService?: PromptCompressionService,
  ) {
    this.logger.log('RAG Generation Service initialized');
  }

  /**
   * Generate notification using RAG pipeline
   * Main entry point for RAG generation
   */
  async generate(
    query: string,
    options?: RAGGenerationOptions,
  ): Promise<RAGGenerationResult> {
    const startTime = Date.now();
    this.totalGenerations++;

    // Start OpenTelemetry span for RAG pipeline
    const ragSpan = this.observabilityService?.startRAGSpan('rag.generate', {
      'rag.query': query,
      'rag.top_k': options?.topK ?? 5,
      'rag.score_threshold': options?.scoreThreshold ?? 0.65,
      'rag.channel': options?.filter?.channel || 'unknown',
      'rag.category': options?.filter?.category || 'unknown',
    });

    try {
      this.logger.log(`Starting RAG generation for query: "${query}"`);

      // Step 1: Retrieve relevant templates
      const retrievalStartTime = Date.now();
      const retrievalSpan = this.observabilityService?.startRetrievalSpan('rag.retrieval', {
        'retrieval.query': query,
        'retrieval.top_k': options?.topK ?? 5,
      });

      const retrievalResult = await this.retrievalService.search({
        queryText: query,
        topK: options?.topK ?? 5,
        scoreThreshold: options?.scoreThreshold ?? 0.65,
        filter: options?.filter as any, // Cast to bypass type checking
      });

      const retrievalTimeMs = Date.now() - retrievalStartTime;

      // Record retrieval metrics
      this.observabilityService?.recordRetrievalRequest({
        durationSeconds: retrievalTimeMs / 1000,
        status: 'success',
        resultsCount: retrievalResult.results.length,
        topK: options?.topK ?? 5,
      });

      if (retrievalSpan) {
        this.observabilityService?.endSpanSuccess(retrievalSpan, {
          'retrieval.results_count': retrievalResult.results.length,
          'retrieval.duration_ms': retrievalTimeMs,
        });
      }

      this.logger.debug(
        `Retrieved ${retrievalResult.results.length} templates in ${retrievalTimeMs}ms`,
      );

      // Step 2: Assemble context with retrieved templates
      const assemblyStartTime = Date.now();
      const assembledContext = await this.contextAssemblyService.assembleContext(
        retrievalResult.results,
        query,
        {
          maxTokens: options?.maxContextTokens ?? 4000,
          minScore: options?.minRelevanceScore ?? 0.5,
          diversityWeight: options?.diversityWeight ?? 0.3,
          systemPrompt: this.buildSystemPrompt(options),
        },
      );

      const assemblyTimeMs = Date.now() - assemblyStartTime;
      this.logger.debug(
        `Assembled context: ${assembledContext.context.length} templates, ${assembledContext.metadata.totalTokens} tokens in ${assemblyTimeMs}ms`,
      );

      // Step 3: Generate response with LLM
      const generationStartTime = Date.now();
      const llmResponse = await this.llmService.generateCompletion(
        assembledContext.prompt,
        {
          temperature: options?.temperature ?? 0.4,
          maxTokens: options?.maxOutputTokens ?? 500,
          topP: options?.topP ?? 0.9,
          stream: false, // Non-streaming for now
        },
      );

      const generationTimeMs = Date.now() - generationStartTime;
      this.logger.debug(
        `Generated response: ${llmResponse.content.length} chars in ${generationTimeMs}ms`,
      );

      // Step 4: Extract source citations
      const sources = this.extractSources(assembledContext.context);

      // Update statistics
      const totalTimeMs = Date.now() - startTime;
      this.totalTokensUsed += llmResponse.usage.totalTokens;
      this.avgGenerationTimeMs =
        (this.avgGenerationTimeMs * (this.totalGenerations - 1) +
          totalTimeMs) /
        this.totalGenerations;

      // Record RAG metrics
      this.observabilityService?.recordRAGRequest({
        channel: options?.filter?.channel,
        category: options?.filter?.category,
        durationSeconds: totalTimeMs / 1000,
        status: 'success',
      });

      // End RAG span with success
      if (ragSpan) {
        this.observabilityService?.endSpanSuccess(ragSpan, {
          'rag.retrieval_ms': retrievalTimeMs,
          'rag.assembly_ms': assemblyTimeMs,
          'rag.generation_ms': generationTimeMs,
          'rag.total_ms': totalTimeMs,
          'rag.retrieved_count': retrievalResult.results.length,
          'rag.context_count': assembledContext.context.length,
          'rag.tokens_used': llmResponse.usage.totalTokens,
          'rag.cost': llmResponse.cost,
        });
      }

      this.logger.log(
        `RAG generation complete: ${totalTimeMs}ms, ${llmResponse.usage.totalTokens} tokens`,
      );

      return {
        content: llmResponse.content,
        sources,
        metadata: {
          query,
          totalTimeMs,
          retrievalTimeMs,
          assemblyTimeMs,
          generationTimeMs,
          retrievedCount: retrievalResult.results.length,
          contextCount: assembledContext.context.length,
          tokensUsed: llmResponse.usage.totalTokens,
          inputTokens: llmResponse.usage.promptTokens ?? 0,
          outputTokens: llmResponse.usage.completionTokens ?? 0,
          cost: llmResponse.cost,
          contextTokens: assembledContext.metadata.totalTokens,
          contextUtilization: assembledContext.metadata.utilizationPercent,
          model: llmResponse.model,
          temperature: options?.temperature ?? 0.4,
          topK: options?.topK ?? 5,
          scoreThreshold: options?.scoreThreshold ?? 0.65,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`RAG generation failed: ${errorMessage}`, error);

      // Record error metrics
      const totalTimeMs = Date.now() - startTime;
      this.observabilityService?.recordRAGRequest({
        channel: options?.filter?.channel,
        category: options?.filter?.category,
        durationSeconds: totalTimeMs / 1000,
        status: 'error',
      });

      this.observabilityService?.recordError('rag.generate', 'RAG_ERROR');

      // End RAG span with error
      if (ragSpan) {
        this.observabilityService?.endSpanError(ragSpan, error as Error);
      }

      throw error;
    }
  }

  /**
   * Generate with streaming support
   * Returns AsyncGenerator for streaming responses
   */
  async *generateStream(
    query: string,
    options?: RAGGenerationOptions,
  ): AsyncGenerator<RAGStreamChunk> {
    const startTime = Date.now();
    this.totalGenerations++;

    try {
      this.logger.log(`Starting RAG streaming generation for query: "${query}"`);

      // Step 1: Retrieve relevant templates
      const retrievalStartTime = Date.now();
      const retrievalResult = await this.retrievalService.search({
        queryText: query,
        topK: options?.topK ?? 5,
        scoreThreshold: options?.scoreThreshold ?? 0.65,
        filter: options?.filter as any, // Cast to bypass type checking
      });

      const retrievalTimeMs = Date.now() - retrievalStartTime;

      // Yield retrieval completion event
      yield {
        type: 'retrieval',
        data: {
          count: retrievalResult.results.length,
          timeMs: retrievalTimeMs,
        },
      };

      // Step 2: Assemble context
      const assemblyStartTime = Date.now();
      const assembledContext = await this.contextAssemblyService.assembleContext(
        retrievalResult.results,
        query,
        {
          maxTokens: options?.maxContextTokens ?? 4000,
          minScore: options?.minRelevanceScore ?? 0.5,
          diversityWeight: options?.diversityWeight ?? 0.3,
          systemPrompt: this.buildSystemPrompt(options),
        },
      );

      const assemblyTimeMs = Date.now() - assemblyStartTime;

      // Yield assembly completion event
      yield {
        type: 'assembly',
        data: {
          contextCount: assembledContext.context.length,
          tokens: assembledContext.metadata.totalTokens,
          timeMs: assemblyTimeMs,
        },
      };

      // Step 3: Stream LLM generation
      const generationStartTime = Date.now();
      let totalContent = '';
      let tokenCount = 0;

      const stream = this.llmService.generateCompletionStream(
        assembledContext.prompt,
        {
          temperature: options?.temperature ?? 0.4,
          maxTokens: options?.maxOutputTokens ?? 500,
          topP: options?.topP ?? 0.9,
        },
      );

      for await (const chunk of stream) {
        totalContent += chunk.content;
        tokenCount += chunk.tokens || 1;

        // Yield content chunk
        yield {
          type: 'content',
          data: {
            content: chunk.content,
            tokens: tokenCount,
          },
        };
      }

      const generationTimeMs = Date.now() - generationStartTime;

      // Step 4: Yield sources and final metadata
      const sources = this.extractSources(assembledContext.context);

      yield {
        type: 'sources',
        data: { sources },
      };

      const totalTimeMs = Date.now() - startTime;
      this.totalTokensUsed += tokenCount;
      this.avgGenerationTimeMs =
        (this.avgGenerationTimeMs * (this.totalGenerations - 1) +
          totalTimeMs) /
        this.totalGenerations;

      yield {
        type: 'complete',
        data: {
          totalTimeMs,
          retrievalTimeMs,
          assemblyTimeMs,
          generationTimeMs,
          tokensUsed: tokenCount,
          sources,
        },
      };

      this.logger.log(
        `RAG streaming generation complete: ${totalTimeMs}ms, ${tokenCount} tokens`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`RAG streaming generation failed: ${errorMessage}`);

      yield {
        type: 'error',
        data: {
          error: errorMessage,
        },
      };

      throw error;
    }
  }

  /**
   * Build system prompt based on options
   * Applies compression if enabled to reduce token usage
   */
  private buildSystemPrompt(options?: RAGGenerationOptions): string {
    const systemPrompt =
      options?.systemPrompt ??
      `You are an expert notification writer. Your task is to generate high-quality, personalized notifications based on the provided template examples.

Guidelines:
1. Match the tone and style of the example templates
2. Keep content concise and clear
3. Include personalization variables ({{variable_name}})
4. Follow channel-specific best practices (email: subject + body, SMS: <160 chars, push: title + body)
5. Include clear call-to-action when appropriate
6. Use professional language appropriate for the notification type

Output ONLY the notification content, without explanations or meta-commentary.`;

    // Apply compression if available and prompt is long enough
    if (this.compressionService && this.compressionService.shouldCompress(systemPrompt)) {
      const compressionResult = this.compressionService.compress(systemPrompt);
      this.logger.debug(
        `System prompt compressed: ${compressionResult.stats.originalTokens} -> ${compressionResult.stats.compressedTokens} tokens (${(compressionResult.stats.tokenReduction * 100).toFixed(1)}% reduction)`,
      );
      return compressionResult.compressed;
    }

    return systemPrompt;
  }

  /**
   * Extract source citations from context
   */
  private extractSources(context: VectorSearchResult[]): SourceCitation[] {
    return context.map((result, index) => ({
      id: result.id,
      channel: result.payload.channel,
      category: result.payload.category,
      score: result.score,
      rank: index + 1,
      excerpt: this.truncateContent(result.payload.content, 200),
      metadata: {
        tone: result.payload.tone,
        language: result.payload.language,
        tags: result.payload.tags,
      },
    }));
  }

  /**
   * Truncate content for excerpts
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get generation statistics
   */
  getStats(): RAGGenerationStats {
    return {
      totalGenerations: this.totalGenerations,
      totalTokensUsed: this.totalTokensUsed,
      avgGenerationTimeMs: this.avgGenerationTimeMs,
      avgTokensPerGeneration:
        this.totalGenerations > 0
          ? this.totalTokensUsed / this.totalGenerations
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalGenerations = 0;
    this.totalTokensUsed = 0;
    this.avgGenerationTimeMs = 0;
    this.logger.log('RAG generation statistics reset');
  }
}

/**
 * RAG Generation Options
 */
export interface RAGGenerationOptions {
  // Retrieval options
  topK?: number;
  scoreThreshold?: number;
  filter?: {
    channel?: string;
    category?: string;
    tone?: string;
    language?: string;
    tags?: string[];
  };

  // Context assembly options
  maxContextTokens?: number;
  minRelevanceScore?: number;
  diversityWeight?: number;

  // Generation options
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  systemPrompt?: string;
}

/**
 * RAG Generation Result
 */
export interface RAGGenerationResult {
  content: string;
  sources: SourceCitation[];
  metadata: RAGGenerationMetadata;
}

/**
 * Source Citation
 */
export interface SourceCitation {
  id: string;
  channel: string;
  category: string;
  score: number;
  rank: number;
  excerpt: string;
  metadata: {
    tone: string;
    language: string;
    tags: string[];
  };
}

/**
 * RAG Generation Metadata
 */
export interface RAGGenerationMetadata {
  query: string;
  totalTimeMs: number;
  retrievalTimeMs: number;
  assemblyTimeMs: number;
  generationTimeMs: number;
  retrievedCount: number;
  contextCount: number;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  contextTokens: number;
  contextUtilization: number;
  model: string;
  temperature: number;
  topK: number;
  scoreThreshold: number;
}

/**
 * RAG Stream Chunk
 */
export interface RAGStreamChunk {
  type: 'retrieval' | 'assembly' | 'content' | 'sources' | 'complete' | 'error';
  data: any;
}

/**
 * RAG Generation Statistics
 */
export interface RAGGenerationStats {
  totalGenerations: number;
  totalTokensUsed: number;
  avgGenerationTimeMs: number;
  avgTokensPerGeneration: number;
}
