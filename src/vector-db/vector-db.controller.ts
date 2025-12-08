import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import { QdrantService } from './services/qdrant.service';
import { EmbeddingService } from './services/embedding.service';
import {
  NotificationTemplate,
  VectorSearchQuery,
} from './interfaces/vector.interface';
import { randomUUID } from 'crypto';

/**
 * Vector DB Controller - API endpoints for vector operations
 */
@Controller('vector-db')
export class VectorDbController {
  private readonly logger = new Logger(VectorDbController.name);

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Upload a notification template
   */
  @Post('templates')
  async uploadTemplate(@Body() template: Omit<NotificationTemplate, 'id'>) {
    try {
      const id = randomUUID();
      const fullTemplate: NotificationTemplate = { id, ...template };

      // Generate embedding
      const embeddingResult = await this.embeddingService.generateEmbedding(
        template.content,
      );

      // Upload to Qdrant
      await this.qdrantService.upsertTemplate(
        fullTemplate,
        embeddingResult.embedding,
      );

      return {
        success: true,
        id,
        message: 'Template uploaded successfully',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to upload template: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Batch upload templates
   */
  @Post('templates/batch')
  async uploadTemplates(@Body() templates: Omit<NotificationTemplate, 'id'>[]) {
    try {
      const templatesWithIds = templates.map((template) => ({
        id: randomUUID(),
        ...template,
      }));

      // Generate embeddings for all templates
      const embeddings = await this.embeddingService.generateEmbeddings(
        templatesWithIds.map((t) => t.content),
      );

      // Prepare for batch upload
      const batch = templatesWithIds.map((template, index) => ({
        template,
        embedding: embeddings[index].embedding,
      }));

      // Batch upload to Qdrant
      await this.qdrantService.upsertTemplates(batch);

      return {
        success: true,
        count: templatesWithIds.length,
        ids: templatesWithIds.map((t) => t.id),
        message: `${templatesWithIds.length} templates uploaded successfully`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to batch upload templates: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Search for similar templates
   */
  @Post('search')
  async search(@Body() query: VectorSearchQuery) {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.generateEmbedding(
        query.queryText,
      );

      // Search in Qdrant
      const results = await this.qdrantService.search(
        queryEmbedding.embedding,
        query,
      );

      return {
        success: true,
        results,
        count: results.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to search: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get collection information
   */
  @Get('collection/info')
  async getCollectionInfo() {
    try {
      const info = await this.qdrantService.getCollectionInfo();

      return {
        success: true,
        info,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get collection info: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get a template by ID
   */
  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    try {
      const template = await this.qdrantService.getTemplate(id);

      if (!template) {
        return {
          success: false,
          error: 'Template not found',
        };
      }

      return {
        success: true,
        template,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get template: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Delete a template
   */
  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    try {
      await this.qdrantService.deleteTemplate(id);

      return {
        success: true,
        message: 'Template deleted successfully',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete template: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Count templates
   */
  @Get('templates/count')
  async countTemplates() {
    try {
      const count = await this.qdrantService.countTemplates();

      return {
        success: true,
        count,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to count templates: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Clear collection (for testing)
   */
  @Delete('collection/clear')
  async clearCollection() {
    try {
      await this.qdrantService.clearCollection();

      return {
        success: true,
        message: 'Collection cleared successfully',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to clear collection: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get embedding model info
   */
  @Get('embedding/info')
  getEmbeddingInfo() {
    const info = this.embeddingService.getModelInfo();

    return {
      success: true,
      model: info.name,
      dimensions: info.dimensions,
      note: 'This is a mock embedding model. In production, use OpenAI, Voyage AI, or local transformers.',
    };
  }
}
