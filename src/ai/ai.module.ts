import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { LLMService } from './services/llm.service';
import { CostTrackingService } from './services/cost-tracking.service';
import { RAGGenerationService } from './services/rag-generation.service';
import { ConversationMemoryService } from './services/conversation-memory.service';
import { ConversationalRAGService } from './services/conversational-rag.service';
import { RAGEvaluationService } from './services/rag-evaluation.service';
import { AIAnalyticsService } from './services/ai-analytics.service';
import { AIObservabilityService } from './services/ai-observability.service';
import { AICostMonitorService } from './services/ai-cost-monitor.service';
import { PromptCompressionService } from './services/prompt-compression.service';
import { ResponseCacheService } from './services/response-cache.service';
import { AIController } from './ai.controller';
import { RAGController } from './rag.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { VectorDbModule } from '../vector-db/vector-db.module';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * AI Module - Provides LLM, RAG, conversational, evaluation, and analytics capabilities
 */
@Module({
  imports: [ConfigModule, VectorDbModule, PrismaModule, PrometheusModule],
  controllers: [AIController, RAGController, AdminAnalyticsController],
  providers: [
    LLMService,
    CostTrackingService,
    RAGGenerationService,
    ConversationMemoryService,
    ConversationalRAGService,
    RAGEvaluationService,
    AIAnalyticsService,
    AIObservabilityService,
    AICostMonitorService,
    PromptCompressionService,
    ResponseCacheService,
  ],
  exports: [
    LLMService,
    CostTrackingService,
    RAGGenerationService,
    ConversationMemoryService,
    ConversationalRAGService,
    RAGEvaluationService,
    AIAnalyticsService,
    AIObservabilityService,
    AICostMonitorService,
    PromptCompressionService,
    ResponseCacheService,
  ],
})
export class AIModule {}
