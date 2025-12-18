import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Conversation Memory Service - Manages conversation history using Redis
 *
 * Features:
 * - Store conversation turns with Redis
 * - Context tracking across multiple turns
 * - Automatic history pruning (token limits)
 * - Conversation expiration (TTL)
 * - Conversation retrieval and management
 */
@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);
  private redis: Redis | null = null;
  private readonly enabled: boolean;
  private readonly conversationTTL: number = 3600; // 1 hour default
  private readonly maxTurnsPerConversation: number = 20;
  private readonly maxTokensPerConversation: number = 8000;

  // In-memory fallback for when Redis is not available
  private memoryStore: Map<string, ConversationHistory> = new Map();

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('redis.url');
    this.enabled = !!redisUrl;

    if (this.enabled && redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        });

        this.redis.on('connect', () => {
          this.logger.log('Redis connected successfully');
        });

        this.redis.on('error', (error) => {
          this.logger.error(`Redis error: ${error.message}`);
        });
      } catch (error) {
        this.logger.warn(
          'Failed to connect to Redis, using in-memory fallback',
          error,
        );
        this.redis = null;
      }
    } else {
      this.logger.warn('Redis not configured, using in-memory fallback');
    }

    this.logger.log('Conversation Memory Service initialized');
  }

  /**
   * Create a new conversation
   */
  async createConversation(userId: string, metadata?: ConversationMetadata): Promise<string> {
    const conversationId = this.generateConversationId();
    const conversation: ConversationHistory = {
      conversationId,
      userId,
      turns: [],
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      },
      totalTokens: 0,
    };

    await this.saveConversation(conversation);

    this.logger.log(`Created conversation ${conversationId} for user ${userId}`);
    return conversationId;
  }

  /**
   * Add a turn to an existing conversation
   */
  async addTurn(
    conversationId: string,
    turn: ConversationTurn,
  ): Promise<ConversationHistory> {
    const conversation = await this.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Add turn
    conversation.turns.push({
      ...turn,
      timestamp: new Date().toISOString(),
    });

    // Update metadata
    conversation.totalTokens += turn.tokensUsed || 0;
    conversation.metadata.lastActivityAt = new Date().toISOString();
    conversation.metadata.totalTurns = conversation.turns.length;

    // Prune if necessary
    if (this.shouldPrune(conversation)) {
      this.pruneConversation(conversation);
    }

    await this.saveConversation(conversation);

    this.logger.debug(
      `Added turn to conversation ${conversationId}: ${conversation.turns.length} turns, ${conversation.totalTokens} tokens`,
    );

    return conversation;
  }

  /**
   * Get conversation history
   */
  async getConversation(conversationId: string): Promise<ConversationHistory | null> {
    if (this.redis) {
      const key = this.getRedisKey(conversationId);
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } else {
      return this.memoryStore.get(conversationId) || null;
    }
  }

  /**
   * Get recent context for RAG generation
   * Returns formatted context from last N turns
   */
  async getRecentContext(
    conversationId: string,
    maxTurns: number = 3,
  ): Promise<string> {
    const conversation = await this.getConversation(conversationId);

    if (!conversation || conversation.turns.length === 0) {
      return '';
    }

    // Get last N turns
    const recentTurns = conversation.turns.slice(-maxTurns);

    // Format as conversation history
    const context = recentTurns
      .map((turn, index) => {
        const parts: string[] = [];

        // Add turn number
        parts.push(`## Turn ${conversation.turns.length - maxTurns + index + 1}`);
        parts.push('');

        // Add user query
        parts.push('**User:**');
        parts.push(turn.userQuery);
        parts.push('');

        // Add assistant response
        if (turn.assistantResponse) {
          parts.push('**Assistant:**');
          parts.push(turn.assistantResponse);
          parts.push('');
        }

        return parts.join('\n');
      })
      .join('\n');

    return context;
  }

  /**
   * List conversations for a user
   */
  async listConversations(userId: string): Promise<ConversationSummary[]> {
    if (this.redis) {
      const pattern = this.getRedisKey('*');
      const keys = await this.redis.keys(pattern);

      const conversations: ConversationSummary[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (!data) continue;

        const conversation: ConversationHistory = JSON.parse(data);

        if (conversation.userId === userId) {
          conversations.push({
            conversationId: conversation.conversationId,
            userId: conversation.userId,
            totalTurns: conversation.turns.length,
            totalTokens: conversation.totalTokens,
            createdAt: conversation.metadata.createdAt,
            lastActivityAt: conversation.metadata.lastActivityAt,
            metadata: conversation.metadata,
          });
        }
      }

      return conversations.sort(
        (a, b) =>
          new Date(b.lastActivityAt || 0).getTime() -
          new Date(a.lastActivityAt || 0).getTime(),
      );
    } else {
      const conversations: ConversationSummary[] = [];

      for (const conversation of this.memoryStore.values()) {
        if (conversation.userId === userId) {
          conversations.push({
            conversationId: conversation.conversationId,
            userId: conversation.userId,
            totalTurns: conversation.turns.length,
            totalTokens: conversation.totalTokens,
            createdAt: conversation.metadata.createdAt,
            lastActivityAt: conversation.metadata.lastActivityAt,
            metadata: conversation.metadata,
          });
        }
      }

      return conversations.sort(
        (a, b) =>
          new Date(b.lastActivityAt || 0).getTime() -
          new Date(a.lastActivityAt || 0).getTime(),
      );
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    if (this.redis) {
      const key = this.getRedisKey(conversationId);
      await this.redis.del(key);
    } else {
      this.memoryStore.delete(conversationId);
    }

    this.logger.log(`Deleted conversation ${conversationId}`);
  }

  /**
   * Clear all conversations for a user
   */
  async clearUserConversations(userId: string): Promise<number> {
    const conversations = await this.listConversations(userId);

    for (const conversation of conversations) {
      await this.deleteConversation(conversation.conversationId);
    }

    this.logger.log(`Cleared ${conversations.length} conversations for user ${userId}`);
    return conversations.length;
  }

  /**
   * Check if conversation should be pruned
   */
  private shouldPrune(conversation: ConversationHistory): boolean {
    return (
      conversation.turns.length > this.maxTurnsPerConversation ||
      conversation.totalTokens > this.maxTokensPerConversation
    );
  }

  /**
   * Prune conversation history
   * Removes oldest turns while keeping recent context
   */
  private pruneConversation(conversation: ConversationHistory): void {
    const originalLength = conversation.turns.length;

    // Strategy 1: Remove by turn count
    while (conversation.turns.length > this.maxTurnsPerConversation) {
      const removedTurn = conversation.turns.shift();
      if (removedTurn) {
        conversation.totalTokens -= removedTurn.tokensUsed || 0;
      }
    }

    // Strategy 2: Remove by token count (keep last 50% of max)
    const targetTokens = this.maxTokensPerConversation * 0.5;
    while (
      conversation.totalTokens > targetTokens &&
      conversation.turns.length > 1
    ) {
      const removedTurn = conversation.turns.shift();
      if (removedTurn) {
        conversation.totalTokens -= removedTurn.tokensUsed || 0;
      }
    }

    this.logger.debug(
      `Pruned conversation ${conversation.conversationId}: ${originalLength} -> ${conversation.turns.length} turns`,
    );
  }

  /**
   * Save conversation to storage
   */
  private async saveConversation(conversation: ConversationHistory): Promise<void> {
    if (this.redis) {
      const key = this.getRedisKey(conversation.conversationId);
      await this.redis.setex(
        key,
        this.conversationTTL,
        JSON.stringify(conversation),
      );
    } else {
      this.memoryStore.set(conversation.conversationId, conversation);
    }
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get Redis key for conversation
   */
  private getRedisKey(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  /**
   * Get service health status
   */
  getHealth(): {
    enabled: boolean;
    redisConnected: boolean;
    storageType: 'redis' | 'memory';
  } {
    return {
      enabled: this.enabled,
      redisConnected: this.redis?.status === 'ready',
      storageType: this.redis ? 'redis' : 'memory',
    };
  }

  /**
   * Cleanup on service destroy
   */
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    }
  }
}

/**
 * Conversation History
 */
export interface ConversationHistory {
  conversationId: string;
  userId: string;
  turns: ConversationTurn[];
  metadata: ConversationMetadata;
  totalTokens: number;
}

/**
 * Conversation Turn
 */
export interface ConversationTurn {
  userQuery: string;
  assistantResponse?: string;
  sources?: SourceReference[];
  tokensUsed?: number;
  timestamp?: string;
  metadata?: {
    retrievedCount?: number;
    generationTimeMs?: number;
    model?: string;
  };
}

/**
 * Source Reference (simplified from citation)
 */
export interface SourceReference {
  id: string;
  channel: string;
  category: string;
  score: number;
}

/**
 * Conversation Metadata
 */
export interface ConversationMetadata {
  createdAt?: string;
  lastActivityAt?: string;
  totalTurns?: number;
  title?: string;
  tags?: string[];
  [key: string]: any;
}

/**
 * Conversation Summary
 */
export interface ConversationSummary {
  conversationId: string;
  userId: string;
  totalTurns: number;
  totalTokens: number;
  createdAt: string | undefined;
  lastActivityAt: string | undefined;
  metadata: ConversationMetadata;
}
