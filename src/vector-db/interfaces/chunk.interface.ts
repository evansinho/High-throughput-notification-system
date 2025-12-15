/**
 * Represents a text chunk for vector embedding
 */
export interface TextChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
  embedding?: number[];
}

/**
 * Metadata associated with a text chunk
 */
export interface ChunkMetadata {
  // Source document information
  templateId: string;
  chunkIndex: number;
  totalChunks: number;

  // Chunk characteristics
  chunkType: ChunkType;
  tokenCount: number;
  characterCount: number;
  startOffset: number;
  endOffset: number;

  // Template metadata (inherited from parent)
  channel: string;
  type: string;
  category?: string;
  tags?: string[];
  tone?: string;
  language?: string;

  // Chunk-specific metadata
  hasSubject?: boolean; // For email chunks that include subject
  hasCallToAction?: boolean;
  hasPersonalization?: boolean;
  variables?: string[];

  // Quality indicators
  completeness: 'complete' | 'partial_start' | 'partial_middle' | 'partial_end';
  sentenceComplete: boolean;

  // Timestamps
  createdAt: Date;
}

/**
 * Chunk type enum
 */
export enum ChunkType {
  MICRO = 'micro', // Subject only (100 tokens)
  MACRO = 'macro', // Body paragraph (500 tokens)
  MEGA = 'mega', // Full template (1500 tokens)
  CUSTOM = 'custom', // Custom size
}

/**
 * Chunking strategy configuration
 */
export interface ChunkingStrategy {
  type: ChunkType;
  maxTokens: number;
  overlapTokens: number;
  overlapPercentage?: number; // Alternative to absolute overlap
  respectSentenceBoundaries: boolean;
  respectParagraphBoundaries: boolean;
  includeSubjectInChunks?: boolean; // For email templates
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: TextChunk[];
  originalLength: number;
  totalChunks: number;
  averageChunkSize: number;
  strategy: ChunkingStrategy;
  processingTimeMs: number;
}

/**
 * Text preprocessing options
 */
export interface PreprocessingOptions {
  normalizeWhitespace?: boolean;
  removeExtraNewlines?: boolean;
  trimLines?: boolean;
  preserveFormatting?: boolean; // Keep formatting like lists, code blocks
  lowercaseContent?: boolean; // For case-insensitive search
}

/**
 * Token estimation result
 */
export interface TokenEstimate {
  tokens: number;
  characters: number;
  words: number;
  sentences: number;
  paragraphs: number;
}
