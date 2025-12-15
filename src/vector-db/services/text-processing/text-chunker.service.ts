import { Injectable, Logger } from '@nestjs/common';
import {
  TextChunk,
  ChunkMetadata,
  ChunkType,
  ChunkingStrategy,
  ChunkingResult,
  TokenEstimate,
} from '../../interfaces/chunk.interface';
import { TemplateDocument } from '../../interfaces/template-document.interface';

/**
 * Service responsible for chunking text documents for vector embedding
 */
@Injectable()
export class TextChunkerService {
  private readonly logger = new Logger(TextChunkerService.name);

  // Default chunking strategies
  private readonly DEFAULT_STRATEGIES: Record<ChunkType, ChunkingStrategy> = {
    [ChunkType.MICRO]: {
      type: ChunkType.MICRO,
      maxTokens: 100,
      overlapTokens: 10,
      overlapPercentage: 10,
      respectSentenceBoundaries: true,
      respectParagraphBoundaries: false,
      includeSubjectInChunks: true,
    },
    [ChunkType.MACRO]: {
      type: ChunkType.MACRO,
      maxTokens: 500,
      overlapTokens: 50,
      overlapPercentage: 10,
      respectSentenceBoundaries: true,
      respectParagraphBoundaries: true,
      includeSubjectInChunks: false,
    },
    [ChunkType.MEGA]: {
      type: ChunkType.MEGA,
      maxTokens: 1500,
      overlapTokens: 150,
      overlapPercentage: 10,
      respectSentenceBoundaries: true,
      respectParagraphBoundaries: true,
      includeSubjectInChunks: false,
    },
    [ChunkType.CUSTOM]: {
      type: ChunkType.CUSTOM,
      maxTokens: 300,
      overlapTokens: 30,
      overlapPercentage: 10,
      respectSentenceBoundaries: true,
      respectParagraphBoundaries: false,
    },
  };

  /**
   * Chunk a template document using specified strategy
   */
  async chunkTemplate(
    template: TemplateDocument,
    strategy?: Partial<ChunkingStrategy>,
  ): Promise<ChunkingResult> {
    const startTime = Date.now();

    // Determine strategy
    const chunkType = strategy?.type || this.selectOptimalStrategy(template);
    const finalStrategy: ChunkingStrategy = {
      ...this.DEFAULT_STRATEGIES[chunkType],
      ...strategy,
    };

    this.logger.debug(
      `Chunking template ${template.id} with strategy ${finalStrategy.type}`,
    );

    // Prepare content
    let content = template.content;
    if (
      finalStrategy.includeSubjectInChunks &&
      template.metadata.subject &&
      template.metadata.channel === 'email'
    ) {
      content = `${template.metadata.subject}\n\n${content}`;
    }

    // Create chunks
    const chunks = this.createChunks(content, template, finalStrategy);

    const processingTimeMs = Date.now() - startTime;

    return {
      chunks,
      originalLength: template.content.length,
      totalChunks: chunks.length,
      averageChunkSize:
        chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length,
      strategy: finalStrategy,
      processingTimeMs,
    };
  }

  /**
   * Select optimal chunking strategy based on template characteristics
   */
  private selectOptimalStrategy(template: TemplateDocument): ChunkType {
    const tokenCount = this.estimateTokens(template.content).tokens;
    const channel = template.metadata.channel;
    const type = template.metadata.type;

    // SMS: Always MICRO (short, single message)
    if (channel === 'sms') {
      return ChunkType.MICRO;
    }

    // Push: Always MICRO (short notifications)
    if (channel === 'push') {
      return ChunkType.MICRO;
    }

    // Email: Choose based on length and type
    if (channel === 'email') {
      // Transactional emails are usually short
      if (type === 'TRANSACTIONAL' && tokenCount < 200) {
        return ChunkType.MACRO;
      }

      // Marketing emails can be long
      if (type === 'MARKETING' && tokenCount > 800) {
        return ChunkType.MEGA;
      }

      // Default to MACRO for emails
      return ChunkType.MACRO;
    }

    // Default: MACRO for balanced chunk size
    return ChunkType.MACRO;
  }

  /**
   * Create chunks from content using fixed-size strategy with overlap
   */
  private createChunks(
    content: string,
    template: TemplateDocument,
    strategy: ChunkingStrategy,
  ): TextChunk[] {
    const chunks: TextChunk[] = [];

    // Handle very short content (smaller than one chunk)
    const tokenEstimate = this.estimateTokens(content);
    if (tokenEstimate.tokens <= strategy.maxTokens) {
      chunks.push(this.createSingleChunk(content, template, strategy, 0, 0, 1));
      return chunks;
    }

    // Split by paragraph if requested
    if (strategy.respectParagraphBoundaries) {
      return this.chunkByParagraphs(content, template, strategy);
    }

    // Split by sentence if requested
    if (strategy.respectSentenceBoundaries) {
      return this.chunkBySentences(content, template, strategy);
    }

    // Fixed-size chunking with character-based estimation
    return this.chunkByFixedSize(content, template, strategy);
  }

  /**
   * Chunk by paragraphs with overlap
   */
  private chunkByParagraphs(
    content: string,
    template: TemplateDocument,
    strategy: ChunkingStrategy,
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    const paragraphs = content
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0);

    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = 0;
    let startOffset = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      const paragraphTokens = this.estimateTokens(paragraph).tokens;

      // If paragraph itself exceeds max tokens, chunk it by sentences
      if (paragraphTokens > strategy.maxTokens) {
        // Flush current chunk if any
        if (currentChunk) {
          chunks.push(
            this.createSingleChunk(
              currentChunk.trim(),
              template,
              strategy,
              chunkIndex++,
              startOffset,
              0, // Will update total at end
            ),
          );
          currentChunk = '';
          currentTokens = 0;
        }

        // Chunk large paragraph by sentences
        const sentenceChunks = this.chunkBySentences(
          paragraph,
          template,
          strategy,
        );
        chunks.push(...sentenceChunks);
        startOffset += paragraph.length + 2; // +2 for \n\n
        continue;
      }

      // Try to add paragraph to current chunk
      if (currentTokens + paragraphTokens <= strategy.maxTokens) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        currentTokens += paragraphTokens;
      } else {
        // Flush current chunk
        if (currentChunk) {
          chunks.push(
            this.createSingleChunk(
              currentChunk.trim(),
              template,
              strategy,
              chunkIndex++,
              startOffset,
              0,
            ),
          );
        }

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(
          currentChunk,
          strategy.overlapTokens,
        );
        currentChunk = overlapText
          ? overlapText + '\n\n' + paragraph
          : paragraph;
        currentTokens = this.estimateTokens(currentChunk).tokens;
        startOffset += currentChunk.length - paragraph.length;
      }
    }

    // Flush final chunk
    if (currentChunk) {
      chunks.push(
        this.createSingleChunk(
          currentChunk.trim(),
          template,
          strategy,
          chunkIndex,
          startOffset,
          0,
        ),
      );
    }

    // Update total chunks count
    const totalChunks = chunks.length;
    chunks.forEach((chunk) => {
      chunk.metadata.totalChunks = totalChunks;
    });

    return chunks;
  }

  /**
   * Chunk by sentences with overlap
   */
  private chunkBySentences(
    content: string,
    template: TemplateDocument,
    strategy: ChunkingStrategy,
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    const sentences = this.splitIntoSentences(content);

    let currentChunk: string[] = [];
    let currentTokens = 0;
    let chunkIndex = 0;
    let startOffset = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence).tokens;

      // If adding this sentence exceeds max tokens, create new chunk
      if (
        currentTokens + sentenceTokens > strategy.maxTokens &&
        currentChunk.length > 0
      ) {
        const chunkText = currentChunk.join(' ');
        chunks.push(
          this.createSingleChunk(
            chunkText,
            template,
            strategy,
            chunkIndex++,
            startOffset,
            0,
          ),
        );

        // Create overlap by keeping last few sentences
        const overlapSentenceCount = Math.ceil(
          currentChunk.length * (strategy.overlapPercentage! / 100),
        );
        currentChunk = currentChunk.slice(-overlapSentenceCount);
        currentTokens = this.estimateTokens(currentChunk.join(' ')).tokens;
        startOffset += chunkText.length - currentChunk.join(' ').length;
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    // Flush final chunk
    if (currentChunk.length > 0) {
      chunks.push(
        this.createSingleChunk(
          currentChunk.join(' '),
          template,
          strategy,
          chunkIndex,
          startOffset,
          0,
        ),
      );
    }

    // Update total chunks count
    const totalChunks = chunks.length;
    chunks.forEach((chunk) => {
      chunk.metadata.totalChunks = totalChunks;
    });

    return chunks;
  }

  /**
   * Fixed-size chunking (character-based with token estimation)
   */
  private chunkByFixedSize(
    content: string,
    template: TemplateDocument,
    strategy: ChunkingStrategy,
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    const avgCharsPerToken = 4; // English average
    const chunkSize = strategy.maxTokens * avgCharsPerToken;
    const overlapSize = strategy.overlapTokens * avgCharsPerToken;

    let position = 0;
    let chunkIndex = 0;

    while (position < content.length) {
      const end = Math.min(position + chunkSize, content.length);
      const chunkText = content.substring(position, end);

      chunks.push(
        this.createSingleChunk(
          chunkText,
          template,
          strategy,
          chunkIndex++,
          position,
          0,
        ),
      );

      position += chunkSize - overlapSize;

      // Prevent infinite loop
      if (position >= content.length - overlapSize) {
        break;
      }
    }

    // Update total chunks count
    const totalChunks = chunks.length;
    chunks.forEach((chunk) => {
      chunk.metadata.totalChunks = totalChunks;
    });

    return chunks;
  }

  /**
   * Create a single chunk with metadata
   */
  private createSingleChunk(
    content: string,
    template: TemplateDocument,
    strategy: ChunkingStrategy,
    chunkIndex: number,
    startOffset: number,
    totalChunks: number,
  ): TextChunk {
    const tokenEstimate = this.estimateTokens(content);

    // Determine completeness
    let completeness: ChunkMetadata['completeness'] = 'complete';
    if (totalChunks > 1) {
      if (chunkIndex === 0) {
        completeness = 'partial_start';
      } else if (chunkIndex === totalChunks - 1) {
        completeness = 'partial_end';
      } else {
        completeness = 'partial_middle';
      }
    }

    // Check if sentence is complete (ends with . ! ?)
    const sentenceComplete = /[.!?]\s*$/.test(content.trim());

    // Extract variables
    const variables = this.extractVariables(content);

    return {
      id: `${template.id}_chunk_${chunkIndex}`,
      content,
      metadata: {
        templateId: template.id,
        chunkIndex,
        totalChunks,
        chunkType: strategy.type,
        tokenCount: tokenEstimate.tokens,
        characterCount: content.length,
        startOffset,
        endOffset: startOffset + content.length,
        channel: template.metadata.channel,
        type: template.metadata.type,
        category: template.metadata.category,
        tags: template.metadata.tags,
        tone: template.metadata.tone,
        language: template.metadata.language,
        hasSubject: content.includes(template.metadata.subject || ''),
        hasCallToAction: this.hasCallToAction(content),
        hasPersonalization: variables.length > 0,
        variables,
        completeness,
        sentenceComplete,
        createdAt: new Date(),
      },
    };
  }

  /**
   * Get overlap text from end of chunk
   */
  private getOverlapText(text: string, overlapTokens: number): string {
    const sentences = this.splitIntoSentences(text);
    const overlapSentences: string[] = [];
    let tokenCount = 0;

    // Add sentences from end until we reach overlap size
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      const sentenceTokens = this.estimateTokens(sentence).tokens;

      if (tokenCount + sentenceTokens > overlapTokens) {
        break;
      }

      overlapSentences.unshift(sentence);
      tokenCount += sentenceTokens;
    }

    return overlapSentences.join(' ');
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries (., !, ?)
    // But preserve abbreviations like "Dr.", "Mr.", "Inc."
    const sentences = text
      .replace(/([.!?])\s+/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return sentences;
  }

  /**
   * Extract variables from content
   */
  private extractVariables(content: string): string[] {
    const variables = new Set<string>();

    // Match {{variable}}, {variable}, ${variable}, %variable%
    const patterns = [
      /\{\{([^}]+)\}\}/g,
      /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
      /\$\{([^}]+)\}/g,
      /%([a-zA-Z_][a-zA-Z0-9_]*)%/g,
    ];

    for (const pattern of patterns) {
      let match = pattern.exec(content);
      while (match !== null) {
        variables.add(match[1].trim());
        match = pattern.exec(content);
      }
    }

    return Array.from(variables);
  }

  /**
   * Check if content has a call-to-action
   */
  private hasCallToAction(content: string): boolean {
    const ctaPatterns = [
      /click here/i,
      /learn more/i,
      /get started/i,
      /sign up/i,
      /subscribe/i,
      /buy now/i,
      /shop now/i,
      /download/i,
      /view \w+/i,
      /visit \w+/i,
    ];

    return ctaPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Estimate token count for text
   * Uses simple heuristic: ~4 characters per token for English
   */
  estimateTokens(text: string): TokenEstimate {
    const characters = text.length;
    const words = text.split(/\s+/).filter((w) => w.length > 0).length;
    const sentences = this.splitIntoSentences(text).length;
    const paragraphs = text
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0).length;

    // English: ~4 chars per token, ~0.75 tokens per word
    const tokens = Math.ceil(characters / 4);

    return {
      tokens,
      characters,
      words,
      sentences,
      paragraphs,
    };
  }

  /**
   * Batch chunk multiple templates
   */
  async chunkBatch(
    templates: TemplateDocument[],
    strategy?: Partial<ChunkingStrategy>,
  ): Promise<Map<string, ChunkingResult>> {
    const results = new Map<string, ChunkingResult>();

    for (const template of templates) {
      const result = await this.chunkTemplate(template, strategy);
      results.set(template.id, result);
    }

    const totalChunks = Array.from(results.values()).reduce(
      (sum, r) => sum + r.totalChunks,
      0,
    );

    this.logger.log(
      `Chunked ${templates.length} templates into ${totalChunks} chunks`,
    );

    return results;
  }
}
