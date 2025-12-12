import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TemplateExtractorService } from './template-extractor.service';
import { TemplateValidatorService } from './template-validator.service';
import { TemplateCleanerService } from './template-cleaner.service';
import { EmbeddingService } from '../embedding.service';
import { QdrantService } from '../qdrant.service';
import {
  RawNotificationData,
  TemplateDocument,
  BatchIngestionResult,
  IngestionError,
  CleaningOptions,
} from '../../interfaces/template-document.interface';

/**
 * Main service responsible for document ingestion pipeline
 * Pipeline: Load → Extract → Validate → Clean → Embed → Store
 */
@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: TemplateExtractorService,
    private readonly validator: TemplateValidatorService,
    private readonly cleaner: TemplateCleanerService,
    private readonly embedding: EmbeddingService,
    private readonly qdrant: QdrantService,
  ) {}

  /**
   * Load notifications from database
   */
  async loadNotifications(
    options: {
      limit?: number;
      offset?: number;
      channel?: string;
      type?: string;
      status?: string;
      minDate?: Date;
      maxDate?: Date;
    } = {},
  ): Promise<RawNotificationData[]> {
    const {
      limit = 1000,
      offset = 0,
      channel,
      type,
      status = 'SENT',
      minDate,
      maxDate,
    } = options;

    this.logger.log(
      `Loading notifications with limit=${limit}, offset=${offset}, channel=${channel}, type=${type}`,
    );

    const where: any = {
      status,
    };

    if (channel) {
      where.channel = channel;
    }

    if (type) {
      where.type = type;
    }

    if (minDate || maxDate) {
      where.createdAt = {};
      if (minDate) {
        where.createdAt.gte = minDate;
      }
      if (maxDate) {
        where.createdAt.lte = maxDate;
      }
    }

    const notifications = await this.prisma.notification.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: 'desc',
      },
    });

    this.logger.log(`Loaded ${notifications.length} notifications`);

    return notifications as RawNotificationData[];
  }

  /**
   * Load archived notifications (historical data with performance metrics)
   */
  async loadArchivedNotifications(
    options: {
      limit?: number;
      offset?: number;
      channel?: string;
      type?: string;
    } = {},
  ): Promise<RawNotificationData[]> {
    const { limit = 1000, offset = 0, channel, type } = options;

    this.logger.log(
      `Loading archived notifications with limit=${limit}, offset=${offset}`,
    );

    const where: any = {};

    if (channel) {
      where.channel = channel;
    }

    if (type) {
      where.type = type;
    }

    const archived = await this.prisma.archivedNotification.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: {
        archivedAt: 'desc',
      },
    });

    this.logger.log(`Loaded ${archived.length} archived notifications`);

    // Map archived notifications to raw notification data format
    return archived.map((a) => ({
      id: a.originalId,
      userId: a.userId,
      tenantId: a.tenantId || undefined,
      eventId: a.eventId || undefined,
      channel: a.channel,
      type: a.type,
      subject: a.subject || undefined,
      content: undefined,
      payload: a.payload,
      status: a.status,
      priority: a.priority,
      sentAt: a.sentAt || undefined,
      deliveredAt: a.deliveredAt || undefined,
      failedAt: a.failedAt || undefined,
      metadata: a.metadata,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })) as RawNotificationData[];
  }

  /**
   * Process a batch of notifications through the ingestion pipeline
   */
  async ingestBatch(
    rawData: RawNotificationData[],
    options: {
      cleaningOptions?: CleaningOptions;
      skipValidation?: boolean;
      skipEmbedding?: boolean;
      skipStorage?: boolean;
    } = {},
  ): Promise<BatchIngestionResult> {
    const startTime = Date.now();
    const errors: IngestionError[] = [];
    const documents: TemplateDocument[] = [];
    let successCount = 0;
    let failureCount = 0;
    const skippedCount = 0;

    this.logger.log(
      `Starting batch ingestion of ${rawData.length} notifications`,
    );

    // Stage 1: Extract
    this.logger.debug('Stage 1: Extracting templates...');
    const extracted = this.extractor.extractBatch(rawData);
    this.logger.log(`Extracted ${extracted.length} templates`);

    // Stage 2: Validate
    if (!options.skipValidation) {
      this.logger.debug('Stage 2: Validating templates...');
      const validationResults = this.validator.validateBatch(extracted);

      for (const [id, result] of validationResults) {
        if (!result.isValid) {
          failureCount++;
          errors.push({
            sourceId: id,
            stage: 'validation',
            errorType: 'VALIDATION_ERROR',
            message: result.errors.map((e) => e.message).join('; '),
            timestamp: new Date(),
          });
        }
      }

      // Filter out invalid templates
      const validTemplates = extracted.filter((t) => {
        const result = validationResults.get(t.id);
        return result && result.isValid;
      });

      this.logger.log(
        `Validated: ${validTemplates.length} valid, ${failureCount} invalid`,
      );

      documents.push(...validTemplates);
    } else {
      documents.push(...extracted);
    }

    // Stage 3: Clean
    this.logger.debug('Stage 3: Cleaning templates...');
    const cleaningOptions: CleaningOptions = {
      removeHtml: true,
      normalizeWhitespace: true,
      removeDuplicates: true,
      extractVariables: true,
      ...options.cleaningOptions,
    };

    const cleaned = this.cleaner.cleanBatch(documents, cleaningOptions);
    this.logger.log(`Cleaned ${cleaned.length} templates`);

    // Stage 4: Embed
    if (!options.skipEmbedding) {
      this.logger.debug('Stage 4: Generating embeddings...');
      try {
        await this.embedBatch(cleaned);
        this.logger.log(`Generated embeddings for ${cleaned.length} templates`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error('Failed to generate embeddings', errorStack);
        errors.push({
          sourceId: 'batch',
          stage: 'embedding',
          errorType: 'EMBEDDING_ERROR',
          message: errorMessage,
          timestamp: new Date(),
        });
        failureCount += cleaned.length;

        const processingTimeMs = Date.now() - startTime;
        return {
          totalProcessed: rawData.length,
          successCount: 0,
          failureCount,
          skippedCount,
          documents: [],
          errors,
          processingTimeMs,
        };
      }
    }

    // Stage 5: Store
    if (!options.skipStorage) {
      this.logger.debug('Stage 5: Storing in vector database...');
      try {
        await this.storeBatch(cleaned);
        successCount = cleaned.length;
        this.logger.log(
          `Stored ${cleaned.length} templates in vector database`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error('Failed to store templates', errorStack);
        errors.push({
          sourceId: 'batch',
          stage: 'storage',
          errorType: 'STORAGE_ERROR',
          message: errorMessage,
          timestamp: new Date(),
        });
        failureCount += cleaned.length;
        successCount = 0;
      }
    } else {
      successCount = cleaned.length;
    }

    const processingTimeMs = Date.now() - startTime;

    this.logger.log(
      `Batch ingestion completed in ${processingTimeMs}ms: ${successCount} succeeded, ${failureCount} failed, ${skippedCount} skipped`,
    );

    return {
      totalProcessed: rawData.length,
      successCount,
      failureCount,
      skippedCount,
      documents: cleaned,
      errors,
      processingTimeMs,
    };
  }

  /**
   * Generate embeddings for a batch of templates
   */
  private async embedBatch(templates: TemplateDocument[]): Promise<void> {
    // Prepare texts for embedding
    const texts = templates.map((t) => {
      // Combine content with subject for better semantic search
      if (t.metadata.subject) {
        return `${t.metadata.subject}\n\n${t.content}`;
      }
      return t.content;
    });

    // Generate embeddings in batch
    const embeddingResults = await this.embedding.generateEmbeddings(texts);

    // Assign embeddings to templates
    for (let i = 0; i < templates.length; i++) {
      templates[i].embedding = embeddingResults[i].embedding;
    }
  }

  /**
   * Store templates in vector database
   */
  private async storeBatch(templates: TemplateDocument[]): Promise<void> {
    const points = templates.map((template) => ({
      id: template.id,
      vector: template.embedding!,
      payload: {
        content: template.content,
        ...template.metadata,
        // Convert dates to ISO strings for JSON serialization
        createdAt: template.metadata.createdAt.toISOString(),
        updatedAt: template.metadata.updatedAt?.toISOString(),
        lastUsedAt: template.metadata.lastUsedAt?.toISOString(),
      },
    }));

    await this.qdrant.upsertTemplates(points);
  }

  /**
   * Ingest all notifications from database
   */
  async ingestAll(
    options: {
      batchSize?: number;
      channel?: string;
      type?: string;
      includeArchived?: boolean;
      cleaningOptions?: CleaningOptions;
    } = {},
  ): Promise<{
    totalProcessed: number;
    totalSuccess: number;
    totalFailures: number;
    batches: number;
    errors: IngestionError[];
  }> {
    const { batchSize = 100, includeArchived = false } = options;

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailures = 0;
    let batches = 0;
    const allErrors: IngestionError[] = [];

    // Get total count
    const totalCount = await this.prisma.notification.count({
      where: {
        status: 'SENT',
        ...(options.channel && { channel: options.channel }),
        ...(options.type && { type: options.type }),
      },
    });

    this.logger.log(`Starting full ingestion: ${totalCount} notifications`);

    // Process in batches
    for (let offset = 0; offset < totalCount; offset += batchSize) {
      const rawData = await this.loadNotifications({
        limit: batchSize,
        offset,
        channel: options.channel,
        type: options.type,
      });

      const result = await this.ingestBatch(rawData, {
        cleaningOptions: options.cleaningOptions,
      });

      totalProcessed += result.totalProcessed;
      totalSuccess += result.successCount;
      totalFailures += result.failureCount;
      allErrors.push(...result.errors);
      batches++;

      this.logger.log(
        `Processed batch ${batches}: ${result.successCount}/${result.totalProcessed} succeeded`,
      );
    }

    // Process archived notifications if requested
    if (includeArchived) {
      const archivedCount = await this.prisma.archivedNotification.count({
        where: {
          ...(options.channel && { channel: options.channel }),
          ...(options.type && { type: options.type }),
        },
      });

      this.logger.log(`Processing ${archivedCount} archived notifications`);

      for (let offset = 0; offset < archivedCount; offset += batchSize) {
        const rawData = await this.loadArchivedNotifications({
          limit: batchSize,
          offset,
          channel: options.channel,
          type: options.type,
        });

        const result = await this.ingestBatch(rawData, {
          cleaningOptions: options.cleaningOptions,
        });

        totalProcessed += result.totalProcessed;
        totalSuccess += result.successCount;
        totalFailures += result.failureCount;
        allErrors.push(...result.errors);
        batches++;
      }
    }

    this.logger.log(
      `Full ingestion completed: ${totalSuccess}/${totalProcessed} succeeded across ${batches} batches`,
    );

    return {
      totalProcessed,
      totalSuccess,
      totalFailures,
      batches,
      errors: allErrors,
    };
  }
}
