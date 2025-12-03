import { Module } from '@nestjs/common';
import { DataPipelineController } from './data-pipeline.controller';
import { ArchivalService } from './archival.service';
import { AuditLogService } from './audit-log.service';
import { ExportService } from './export.service';
import { AnonymizationService } from './anonymization.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * DataPipelineModule - Data management and lifecycle
 *
 * Features:
 * - Archival (move old data to cold storage)
 * - Audit logging (track admin actions)
 * - Data export (CSV, JSON)
 * - Anonymization (GDPR compliance)
 */
@Module({
  imports: [PrismaModule],
  controllers: [DataPipelineController],
  providers: [
    ArchivalService,
    AuditLogService,
    ExportService,
    AnonymizationService,
  ],
  exports: [
    ArchivalService,
    AuditLogService,
    ExportService,
    AnonymizationService,
  ],
})
export class DataPipelineModule {}
