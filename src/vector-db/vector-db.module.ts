import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QdrantService } from './services/qdrant.service';
import { EmbeddingService } from './services/embedding.service';
import { DocumentIngestionService } from './services/ingestion/document-ingestion.service';
import { TemplateExtractorService } from './services/ingestion/template-extractor.service';
import { TemplateValidatorService } from './services/ingestion/template-validator.service';
import { TemplateCleanerService } from './services/ingestion/template-cleaner.service';
import { VectorDbController } from './vector-db.controller';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Vector DB Module - Provides vector storage and similarity search capabilities
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [VectorDbController],
  providers: [
    QdrantService,
    EmbeddingService,
    DocumentIngestionService,
    TemplateExtractorService,
    TemplateValidatorService,
    TemplateCleanerService,
  ],
  exports: [QdrantService, EmbeddingService, DocumentIngestionService],
})
export class VectorDbModule {}
