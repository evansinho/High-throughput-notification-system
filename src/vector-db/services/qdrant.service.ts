import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  NotificationTemplate,
  VectorSearchQuery,
  VectorSearchResult,
  CollectionInfo,
} from '../interfaces/vector.interface';

/**
 * Qdrant Service - Handles vector storage and similarity search
 */
@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;
  private readonly collectionName = 'notification_templates';
  private readonly vectorSize = 1536; // For text-embedding-ada-002 or similar

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('vectorDb.qdrant.url');
    const apiKey = this.configService.get<string>('vectorDb.qdrant.apiKey');

    this.client = new QdrantClient({
      url,
      apiKey,
      checkCompatibility: false, // Disable version check
    });

    this.logger.log(`Qdrant client initialized: ${url}`);
  }

  async onModuleInit() {
    try {
      // Create collection if it doesn't exist
      await this.ensureCollection();
      this.logger.log('Qdrant connection established');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize Qdrant: ${errorMessage}`);
    }
  }

  /**
   * Ensure collection exists, create if not
   */
  async ensureCollection(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (col) => col.name === this.collectionName,
      );

      if (!exists) {
        this.logger.log(
          `Creating collection: ${this.collectionName} (vector_size: ${this.vectorSize})`,
        );

        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
        });

        // Create payload index for faster filtering
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'channel',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'category',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'tone',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'language',
          field_schema: 'keyword',
        });

        this.logger.log(
          `Collection ${this.collectionName} created with indexes`,
        );
      } else {
        this.logger.log(`Collection ${this.collectionName} already exists`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to ensure collection: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Upload a notification template with its embedding
   */
  async upsertTemplate(
    template: NotificationTemplate,
    embedding: number[],
  ): Promise<void> {
    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: template.id,
            vector: embedding,
            payload: template as any,
          },
        ],
      });

      this.logger.debug(`Template upserted: ${template.id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to upsert template: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Batch upload templates
   */
  async upsertTemplates(
    templates: Array<{ template: NotificationTemplate; embedding: number[] }>,
  ): Promise<void> {
    try {
      const points = templates.map((item) => ({
        id: item.template.id,
        vector: item.embedding,
        payload: item.template as any,
      }));

      await this.client.upsert(this.collectionName, {
        wait: true,
        points,
      });

      this.logger.log(`Batch upserted ${templates.length} templates`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to batch upsert templates: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Search for similar templates
   */
  async search(
    queryEmbedding: number[],
    query: VectorSearchQuery,
  ): Promise<VectorSearchResult[]> {
    try {
      const filter: any = {};

      // Build filter from query
      if (query.filter) {
        const must: any[] = [];

        if (query.filter.channel) {
          must.push({
            key: 'channel',
            match: { value: query.filter.channel },
          });
        }

        if (query.filter.category) {
          must.push({
            key: 'category',
            match: { value: query.filter.category },
          });
        }

        if (query.filter.tone) {
          must.push({
            key: 'tone',
            match: { value: query.filter.tone },
          });
        }

        if (query.filter.language) {
          must.push({
            key: 'language',
            match: { value: query.filter.language },
          });
        }

        if (query.filter.tags && query.filter.tags.length > 0) {
          must.push({
            key: 'tags',
            match: { any: query.filter.tags },
          });
        }

        if (must.length > 0) {
          filter.must = must;
        }
      }

      const searchResult = await this.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit: query.topK || 10,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        score_threshold: query.scoreThreshold ?? 0.7,
        with_payload: true,
      });

      return searchResult.map((result) => ({
        id: String(result.id),
        score: result.score,
        payload: result.payload as any as NotificationTemplate,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to search: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get collection information
   */
  async getCollectionInfo(): Promise<CollectionInfo> {
    try {
      const info = await this.client.getCollection(this.collectionName);

      // Handle both single vector and named vectors config
      const vectorsConfig = info.config?.params?.vectors as any;
      const vectorSize: number = vectorsConfig?.size ?? this.vectorSize;
      const distance: 'Cosine' | 'Euclid' | 'Dot' =
        vectorsConfig?.distance ?? 'Cosine';

      return {
        name: this.collectionName,
        vectorSize,
        distance,
        pointsCount: info.points_count || 0,
        status: info.status,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get collection info: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Delete a template by ID
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: [id],
      });

      this.logger.debug(`Template deleted: ${id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete template: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Delete all templates (for testing)
   */
  async clearCollection(): Promise<void> {
    try {
      await this.client.deleteCollection(this.collectionName);
      await this.ensureCollection();

      this.logger.warn(`Collection ${this.collectionName} cleared`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to clear collection: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get a template by ID
   */
  async getTemplate(id: string): Promise<NotificationTemplate | null> {
    try {
      const result = await this.client.retrieve(this.collectionName, {
        ids: [id],
        with_payload: true,
      });

      if (result.length === 0) {
        return null;
      }

      return result[0].payload as any as NotificationTemplate;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get template: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Count templates
   */
  async countTemplates(): Promise<number> {
    try {
      const info = await this.getCollectionInfo();
      return info.pointsCount;
    } catch {
      return 0;
    }
  }
}
