import { Injectable, Logger } from '@nestjs/common';
import { RAGGenerationService, RAGGenerationOptions } from './rag-generation.service';
import { ConversationMemoryService } from './conversation-memory.service';

/**
 * Conversational RAG Service - Multi-turn conversation support
 *
 * Features:
 * - Conversation memory and tracking
 * - Context-aware follow-up questions
 * - Automatic conversation pruning
 * - Conversation management
 */
@Injectable()
export class ConversationalRAGService {
  private readonly logger = new Logger(ConversationalRAGService.name);

  constructor(
    private readonly ragService: RAGGenerationService,
    private readonly memoryService: ConversationMemoryService,
  ) {
    this.logger.log('Conversational RAG Service initialized');
  }

  /**
   * Start a new conversation
   */
  async startConversation(
    userId: string,
    metadata?: { title?: string; tags?: string[] },
  ): Promise<string> {
    return await this.memoryService.createConversation(userId, metadata as any);
  }

  /**
   * Generate response in conversation context
   * Includes conversation history in the prompt
   */
  async generateInConversation(
    conversationId: string,
    query: string,
    options?: RAGGenerationOptions & {
      includeHistory?: boolean;
      maxHistoryTurns?: number;
    },
  ): Promise<ConversationalRAGResult> {
    const startTime = Date.now();

    try {
      // Get conversation history
      const conversation = await this.memoryService.getConversation(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Build context-aware prompt
      const contextualQuery = await this.buildContextualQuery(
        query,
        conversationId,
        options?.includeHistory ?? true,
        options?.maxHistoryTurns ?? 3,
      );

      this.logger.debug(
        `Generating in conversation ${conversationId}: ${conversation.turns.length} previous turns`,
      );

      // Generate response using RAG
      const ragResult = await this.ragService.generate(
        contextualQuery,
        options,
      );

      // Save turn to conversation
      await this.memoryService.addTurn(conversationId, {
        userQuery: query,
        assistantResponse: ragResult.content,
        sources: ragResult.sources.map((s) => ({
          id: s.id,
          channel: s.channel,
          category: s.category,
          score: s.score,
        })),
        tokensUsed: ragResult.metadata.tokensUsed,
        metadata: {
          retrievedCount: ragResult.metadata.retrievedCount,
          generationTimeMs: ragResult.metadata.generationTimeMs,
          model: ragResult.metadata.model,
        },
      });

      const totalTimeMs = Date.now() - startTime;

      this.logger.log(
        `Conversational generation complete: conversation ${conversationId}, turn ${conversation.turns.length + 1}, ${totalTimeMs}ms`,
      );

      return {
        ...ragResult,
        conversationId,
        turnNumber: conversation.turns.length + 1,
        totalTurns: conversation.turns.length + 1,
        conversationMetadata: {
          totalTimeMs,
          historyIncluded: options?.includeHistory ?? true,
          historyTurns: Math.min(
            conversation.turns.length,
            options?.maxHistoryTurns ?? 3,
          ),
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Conversational generation failed: ${errorMessage}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Stream generation in conversation context
   */
  async *generateStreamInConversation(
    conversationId: string,
    query: string,
    options?: RAGGenerationOptions & {
      includeHistory?: boolean;
      maxHistoryTurns?: number;
    },
  ): AsyncGenerator<ConversationalStreamChunk> {
    try {
      // Get conversation history
      const conversation = await this.memoryService.getConversation(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Build context-aware prompt
      const contextualQuery = await this.buildContextualQuery(
        query,
        conversationId,
        options?.includeHistory ?? true,
        options?.maxHistoryTurns ?? 3,
      );

      // Yield conversation metadata first
      yield {
        type: 'conversation',
        data: {
          conversationId,
          turnNumber: conversation.turns.length + 1,
          historyTurns: Math.min(
            conversation.turns.length,
            options?.maxHistoryTurns ?? 3,
          ),
        },
      };

      // Stream RAG generation
      let fullContent = '';
      let sources: any[] = [];
      let tokensUsed = 0;
      let metadata: any = {};

      const stream = this.ragService.generateStream(
        contextualQuery,
        options,
      );

      for await (const chunk of stream) {
        // Pass through all chunks
        yield {
          type: chunk.type as any,
          data: chunk.data,
        };

        // Track data for saving to conversation
        if (chunk.type === 'content') {
          fullContent += chunk.data.content || '';
        } else if (chunk.type === 'sources') {
          sources = chunk.data.sources || [];
        } else if (chunk.type === 'complete') {
          tokensUsed = chunk.data.tokensUsed || 0;
          metadata = chunk.data;
        }
      }

      // Save turn to conversation
      await this.memoryService.addTurn(conversationId, {
        userQuery: query,
        assistantResponse: fullContent,
        sources: sources.map((s) => ({
          id: s.id,
          channel: s.channel,
          category: s.category,
          score: s.score,
        })),
        tokensUsed,
        metadata: {
          retrievedCount: metadata.retrievedCount,
          generationTimeMs: metadata.generationTimeMs,
          model: metadata.model,
        },
      });

      this.logger.log(
        `Conversational streaming complete: conversation ${conversationId}, turn ${conversation.turns.length + 1}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Conversational streaming failed: ${errorMessage}`,
        error,
      );

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
   * Build context-aware query with conversation history
   */
  private async buildContextualQuery(
    query: string,
    conversationId: string,
    includeHistory: boolean,
    maxHistoryTurns: number,
  ): Promise<string> {
    if (!includeHistory) {
      return query;
    }

    // Get recent conversation context
    const historyContext = await this.memoryService.getRecentContext(
      conversationId,
      maxHistoryTurns,
    );

    if (!historyContext) {
      return query;
    }

    // Build contextual prompt
    const parts: string[] = [];

    parts.push('# Conversation History');
    parts.push('');
    parts.push(historyContext);
    parts.push('---');
    parts.push('');
    parts.push('# Current Request');
    parts.push('');
    parts.push(query);
    parts.push('');
    parts.push(
      'Note: Consider the conversation history when generating the response. If the current request is a follow-up question, use context from previous turns.',
    );

    return parts.join('\n');
  }

  /**
   * Get conversation history
   */
  async getConversation(conversationId: string) {
    return await this.memoryService.getConversation(conversationId);
  }

  /**
   * List user conversations
   */
  async listConversations(userId: string) {
    return await this.memoryService.listConversations(userId);
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string) {
    return await this.memoryService.deleteConversation(conversationId);
  }

  /**
   * Clear all user conversations
   */
  async clearUserConversations(userId: string) {
    return await this.memoryService.clearUserConversations(userId);
  }

  /**
   * Get service health
   */
  getHealth() {
    return this.memoryService.getHealth();
  }
}

/**
 * Conversational RAG Result
 */
export interface ConversationalRAGResult {
  content: string;
  sources: any[];
  metadata: any;
  conversationId: string;
  turnNumber: number;
  totalTurns: number;
  conversationMetadata: {
    totalTimeMs: number;
    historyIncluded: boolean;
    historyTurns: number;
  };
}

/**
 * Conversational Stream Chunk
 */
export interface ConversationalStreamChunk {
  type:
    | 'conversation'
    | 'retrieval'
    | 'assembly'
    | 'content'
    | 'sources'
    | 'complete'
    | 'error';
  data: any;
}
