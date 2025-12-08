import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QdrantService } from './services/qdrant.service';
import { EmbeddingService } from './services/embedding.service';
import { VectorDbController } from './vector-db.controller';

/**
 * Vector DB Module - Provides vector storage and similarity search capabilities
 */
@Module({
  imports: [ConfigModule],
  controllers: [VectorDbController],
  providers: [QdrantService, EmbeddingService],
  exports: [QdrantService, EmbeddingService],
})
export class VectorDbModule {}
