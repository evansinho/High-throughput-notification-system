import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Sse,
  MessageEvent,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RAGGenerationService } from './services/rag-generation.service';
import { ConversationalRAGService } from './services/conversational-rag.service';
import { IsString, IsOptional, IsNumber, Min, Max, IsObject, IsBoolean } from 'class-validator';
import { Observable, from, map } from 'rxjs';

/**
 * RAG Controller - Handles RAG generation and conversation requests
 */
@Controller('rag')
@UseGuards(JwtAuthGuard)
export class RAGController {
  constructor(
    private readonly ragService: RAGGenerationService,
    private readonly conversationalRagService: ConversationalRAGService,
  ) {}

  /**
   * Generate notification using RAG
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@Body() dto: GenerateNotificationDto) {
    const result = await this.ragService.generate(dto.query, {
      topK: dto.topK,
      scoreThreshold: dto.scoreThreshold,
      maxContextTokens: dto.maxContextTokens,
      maxOutputTokens: dto.maxOutputTokens,
      temperature: dto.temperature,
      topP: dto.topP,
      filter: dto.filter,
      systemPrompt: dto.systemPrompt,
    });

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Generate with streaming (SSE)
   */
  @Sse('generate/stream')
  async generateStream(
    @Body() dto: GenerateNotificationDto,
  ): Promise<Observable<MessageEvent>> {
    const stream = this.ragService.generateStream(dto.query, {
      topK: dto.topK,
      scoreThreshold: dto.scoreThreshold,
      maxContextTokens: dto.maxContextTokens,
      maxOutputTokens: dto.maxOutputTokens,
      temperature: dto.temperature,
      topP: dto.topP,
      filter: dto.filter,
      systemPrompt: dto.systemPrompt,
    });

    return from(stream).pipe(
      map((chunk) => ({
        data: chunk,
      })),
    );
  }

  /**
   * Get RAG generation statistics
   */
  @Get('stats')
  getStats() {
    return {
      success: true,
      data: this.ragService.getStats(),
    };
  }

  /**
   * Reset statistics
   */
  @Post('stats/reset')
  @HttpCode(HttpStatus.OK)
  resetStats() {
    this.ragService.resetStats();
    return {
      success: true,
      message: 'Statistics reset successfully',
    };
  }

  // ============ Conversation Endpoints ============

  /**
   * Start a new conversation
   */
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  async startConversation(@Req() req: any, @Body() dto: StartConversationDto) {
    const userId = req.user?.userId || 'anonymous';
    const conversationId = await this.conversationalRagService.startConversation(
      userId,
      dto,
    );

    return {
      success: true,
      data: { conversationId },
    };
  }

  /**
   * Generate in conversation context
   */
  @Post('conversations/:conversationId/generate')
  @HttpCode(HttpStatus.OK)
  async generateInConversation(
    @Param('conversationId') conversationId: string,
    @Body() dto: ConversationalGenerateDto,
  ) {
    const result = await this.conversationalRagService.generateInConversation(
      conversationId,
      dto.query,
      {
        topK: dto.topK,
        scoreThreshold: dto.scoreThreshold,
        maxContextTokens: dto.maxContextTokens,
        maxOutputTokens: dto.maxOutputTokens,
        temperature: dto.temperature,
        topP: dto.topP,
        filter: dto.filter,
        systemPrompt: dto.systemPrompt,
        includeHistory: dto.includeHistory,
        maxHistoryTurns: dto.maxHistoryTurns,
      },
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Stream generation in conversation context
   */
  @Sse('conversations/:conversationId/generate/stream')
  async generateStreamInConversation(
    @Param('conversationId') conversationId: string,
    @Body() dto: ConversationalGenerateDto,
  ): Promise<Observable<MessageEvent>> {
    const stream =
      this.conversationalRagService.generateStreamInConversation(
        conversationId,
        dto.query,
        {
          topK: dto.topK,
          scoreThreshold: dto.scoreThreshold,
          maxContextTokens: dto.maxContextTokens,
          maxOutputTokens: dto.maxOutputTokens,
          temperature: dto.temperature,
          topP: dto.topP,
          filter: dto.filter,
          systemPrompt: dto.systemPrompt,
          includeHistory: dto.includeHistory,
          maxHistoryTurns: dto.maxHistoryTurns,
        },
      );

    return from(stream).pipe(
      map((chunk) => ({
        data: chunk,
      })),
    );
  }

  /**
   * Get conversation history
   */
  @Get('conversations/:conversationId')
  async getConversation(@Param('conversationId') conversationId: string) {
    const conversation = await this.conversationalRagService.getConversation(
      conversationId,
    );

    return {
      success: true,
      data: conversation,
    };
  }

  /**
   * List user conversations
   */
  @Get('conversations')
  async listConversations(@Req() req: any) {
    const userId = req.user?.userId || 'anonymous';
    const conversations = await this.conversationalRagService.listConversations(
      userId,
    );

    return {
      success: true,
      data: conversations,
    };
  }

  /**
   * Delete conversation
   */
  @Delete('conversations/:conversationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(@Param('conversationId') conversationId: string) {
    await this.conversationalRagService.deleteConversation(conversationId);
  }

  /**
   * Clear all user conversations
   */
  @Delete('conversations')
  @HttpCode(HttpStatus.OK)
  async clearConversations(@Req() req: any) {
    const userId = req.user?.userId || 'anonymous';
    const count = await this.conversationalRagService.clearUserConversations(
      userId,
    );

    return {
      success: true,
      data: { deletedCount: count },
    };
  }

  /**
   * Get conversation service health
   */
  @Get('conversations/health')
  getConversationHealth() {
    return {
      success: true,
      data: this.conversationalRagService.getHealth(),
    };
  }
}

/**
 * DTO for generate notification request
 */
export class GenerateNotificationDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  scoreThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(8000)
  maxContextTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(2000)
  maxOutputTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @IsOptional()
  @IsObject()
  filter?: {
    channel?: string;
    category?: string;
    tone?: string;
    language?: string;
    tags?: string[];
  };

  @IsOptional()
  @IsString()
  systemPrompt?: string;
}

/**
 * DTO for starting a conversation
 */
export class StartConversationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  tags?: string[];
}

/**
 * DTO for conversational generation
 */
export class ConversationalGenerateDto extends GenerateNotificationDto {
  @IsOptional()
  @IsBoolean()
  includeHistory?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxHistoryTurns?: number;
}
