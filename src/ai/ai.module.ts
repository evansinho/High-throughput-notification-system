import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LLMService } from './services/llm.service';
import { CostTrackingService } from './services/cost-tracking.service';
import { AIController } from './ai.controller';

/**
 * AI Module - Provides LLM capabilities for the notification system
 */
@Module({
  imports: [ConfigModule],
  controllers: [AIController],
  providers: [LLMService, CostTrackingService],
  exports: [LLMService, CostTrackingService],
})
export class AIModule {}
