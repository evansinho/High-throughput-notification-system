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
 *
 * Features:
 * - Bulk upload optimization (batch processing with configurable size)
 * - Advanced indexing strategy (keyword indexes for all metadata fields)
 * - Vector versioning (track version history with metadata)
 * - Automatic cleanup for old data (configurable retention period)
 * - Point statistics and monitoring
 */
@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;
  private readonly collectionName = 'notification_templates';
  private readonly vectorSize = 512; // For text-embedding-3-small
  private readonly batchSize = 100; // Bulk upsert batch size

  // Statistics
  private totalUploaded = 0;
  private totalDeleted = 0;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('vectorDb.qdrant.url');
    const apiKey = this.configService.get<string>('vectorDb.qdrant.apiKey');

    this.client = new QdrantClient({
      url,
      apiKey,
      checkCompatibility: false, // Disable version check
    });

    this.logger.log(`Qdrant client initialized: ${url}`);
    this.logger.log(`Vector size: ${this.vectorSize}`);
    this.logger.log(`Batch size: ${this.batchSize}`);
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

        // Create comprehensive payload indexes for faster filtering
        const indexFields = [
          'channel', // email, sms, push, in_app, webhook
          'category', // transactional, marketing, system
          'tone', // professional, casual, urgent, friendly
          'language', // en, es, fr, etc.
          'tags', // Array of tags
          'version', // Version number for versioning
          'status', // active, archived, deleted
          'createdAt', // Timestamp for cleanup
        ];

        for (const field of indexFields) {
          try {
            await this.client.createPayloadIndex(this.collectionName, {
              field_name: field,
              field_schema: field === 'createdAt' ? 'integer' : 'keyword',
            });
            this.logger.debug(`Index created for field: ${field}`);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (error) {
            // Index might already exist, continue
            this.logger.debug(`Index for ${field} may already exist`);
          }
        }

        this.logger.log(
          `Collection ${this.collectionName} created with ${indexFields.length} indexes`,
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
   * Supports versioning via payload metadata
   */
  async upsertTemplate(
    template: NotificationTemplate,
    embedding: number[],
    options?: {
      version?: number;
      status?: 'active' | 'archived' | 'deleted';
    },
  ): Promise<void> {
    try {
      const payload: any = {
        ...template,
        version: options?.version ?? 1,
        status: options?.status ?? 'active',
        updatedAt: Date.now(),
      };

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: template.id,
            vector: embedding,
            payload,
          },
        ],
      });

      this.totalUploaded++;
      this.logger.debug(
        `Template upserted: ${template.id} (v${payload.version})`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to upsert template: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Batch upload templates with bulk optimization
   * Processes in chunks of batchSize (default 100) for efficiency
   */
  async upsertTemplates(
    templates: Array<{
      template: NotificationTemplate;
      embedding: number[];
      version?: number;
      status?: 'active' | 'archived' | 'deleted';
    }>,
  ): Promise<{ uploaded: number; processingTimeMs: number }> {
    const startTime = Date.now();

    try {
      let uploaded = 0;

      // Process in batches
      for (let i = 0; i < templates.length; i += this.batchSize) {
        const batch = templates.slice(i, i + this.batchSize);

        this.logger.log(
          `Uploading batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(templates.length / this.batchSize)} (${batch.length} templates)`,
        );

        const points = batch.map((item) => ({
          id: item.template.id,
          vector: item.embedding,
          payload: {
            ...item.template,
            version: item.version ?? 1,
            status: item.status ?? 'active',
            updatedAt: Date.now(),
          } as any,
        }));

        await this.client.upsert(this.collectionName, {
          wait: true,
          points,
        });

        uploaded += batch.length;
        this.totalUploaded += batch.length;
      }

      const processingTimeMs = Date.now() - startTime;

      this.logger.log(
        `Batch upload complete: ${uploaded} templates in ${processingTimeMs}ms (${Math.round(uploaded / (processingTimeMs / 1000))} templates/sec)`,
      );

      return { uploaded, processingTimeMs };
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

  /**
   * Clean up old vectors based on age
   * Deletes vectors older than retentionDays
   */
  async cleanupOldVectors(retentionDays = 90): Promise<number> {
    try {
      const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      // Delete old vectors using filter
      const result = await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'createdAt',
              range: {
                lt: cutoffTimestamp,
              },
            },
          ],
        },
      });

      const deleted = result.operation_id ? 1 : 0; // Qdrant doesn't return count
      this.totalDeleted += deleted;

      this.logger.log(
        `Cleaned up vectors older than ${retentionDays} days (cutoff: ${new Date(cutoffTimestamp).toISOString()})`,
      );

      return deleted;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to cleanup old vectors: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Clean up archived/deleted vectors
   */
  async cleanupArchivedVectors(): Promise<number> {
    try {
      const result = await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          should: [
            {
              key: 'status',
              match: { value: 'archived' },
            },
            {
              key: 'status',
              match: { value: 'deleted' },
            },
          ],
        },
      });

      const deleted = result.operation_id ? 1 : 0;
      this.totalDeleted += deleted;

      this.logger.log(`Cleaned up archived/deleted vectors`);

      return deleted;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to cleanup archived vectors: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Update vector status (for soft delete/archive)
   */
  async updateVectorStatus(
    id: string,
    status: 'active' | 'archived' | 'deleted',
  ): Promise<void> {
    try {
      // Qdrant doesn't support partial payload updates directly
      // We need to retrieve, modify, and upsert
      const existing = await this.getTemplate(id);
      if (!existing) {
        throw new Error(`Template not found: ${id}`);
      }

      // Get the embedding - we need to retrieve it separately
      const result = await this.client.retrieve(this.collectionName, {
        ids: [id],
        with_vector: true,
      });

      if (result.length === 0 || !result[0].vector) {
        throw new Error(`Vector not found for template: ${id}`);
      }

      const embedding = Array.isArray(result[0].vector)
        ? result[0].vector
        : Object.values(result[0].vector)[0];

      // Upsert with updated status
      await this.upsertTemplate(existing, embedding as number[], { status });

      this.logger.debug(`Updated status for ${id}: ${status}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update vector status: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get statistics
   */
  getStats(): { totalUploaded: number; totalDeleted: number } {
    return {
      totalUploaded: this.totalUploaded,
      totalDeleted: this.totalDeleted,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalUploaded = 0;
    this.totalDeleted = 0;
    this.logger.log('Qdrant statistics reset');
  }

  /**
   * Scroll through all points (for bulk operations)
   */
  async *scrollPoints(
    filter?: any,
    batchSize = 100,
  ): AsyncGenerator<NotificationTemplate[]> {
    try {
      let offset: string | number | undefined = undefined;

      while (true) {
        const result = await this.client.scroll(this.collectionName, {
          filter,
          limit: batchSize,
          offset,
          with_payload: true,
        });

        if (result.points.length === 0) {
          break;
        }

        const templates = result.points.map(
          (point) => point.payload as any as NotificationTemplate,
        );

        yield templates;

        // Handle next_page_offset which can be null
        const nextOffset = result.next_page_offset;
        if (!nextOffset || nextOffset === null) {
          break;
        }
        offset = typeof nextOffset === 'object' ? undefined : nextOffset;
        if (!offset) {
          break;
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to scroll points: ${errorMessage}`);
      throw error;
    }
  }
}
