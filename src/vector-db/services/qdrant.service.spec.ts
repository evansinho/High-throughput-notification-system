import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QdrantService } from './qdrant.service';

describe('QdrantService', () => {
  let service: QdrantService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    // Mock ConfigService
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'vectorDb.qdrant.url') return 'http://localhost:6333';
        if (key === 'vectorDb.qdrant.apiKey') return undefined;
        return undefined;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QdrantService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<QdrantService>(QdrantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with correct vector size', () => {
    expect(service['vectorSize']).toBe(512);
  });

  it('should track statistics', () => {
    const stats = service.getStats();
    expect(stats).toEqual({
      totalUploaded: 0,
      totalDeleted: 0,
    });
  });

  it('should reset statistics', () => {
    service.resetStats();
    const stats = service.getStats();
    expect(stats.totalUploaded).toBe(0);
    expect(stats.totalDeleted).toBe(0);
  });

  // Note: Full integration tests require running Qdrant instance
  // These tests verify service structure and methods exist
  it('should have upsertTemplate method', () => {
    expect(service.upsertTemplate).toBeDefined();
  });

  it('should have upsertTemplates method', () => {
    expect(service.upsertTemplates).toBeDefined();
  });

  it('should have search method', () => {
    expect(service.search).toBeDefined();
  });

  it('should have cleanupOldVectors method', () => {
    expect(service.cleanupOldVectors).toBeDefined();
  });

  it('should have cleanupArchivedVectors method', () => {
    expect(service.cleanupArchivedVectors).toBeDefined();
  });

  it('should have updateVectorStatus method', () => {
    expect(service.updateVectorStatus).toBeDefined();
  });

  it('should have scrollPoints method', () => {
    expect(service.scrollPoints).toBeDefined();
  });
});
