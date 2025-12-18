import { Injectable, Logger } from '@nestjs/common';

/**
 * Prompt Compression Service
 *
 * Reduces token usage through intelligent compression techniques:
 * - Remove redundant whitespace and formatting
 * - Abbreviate common words and phrases
 * - Remove unnecessary punctuation
 * - Compress repetitive instructions
 * - Maintain semantic meaning
 *
 * Target: 30% token reduction without quality loss
 */
@Injectable()
export class PromptCompressionService {
  private readonly logger = new Logger(PromptCompressionService.name);

  // Common phrases that can be abbreviated without losing meaning
  private readonly abbreviations: Map<string, string> = new Map([
    ['notification', 'notif'],
    ['notifications', 'notifs'],
    ['information', 'info'],
    ['please', 'pls'],
    ['approximately', 'approx'],
    ['maximum', 'max'],
    ['minimum', 'min'],
    ['temperature', 'temp'],
    ['configuration', 'config'],
    ['documentation', 'docs'],
    ['repository', 'repo'],
    ['implementation', 'impl'],
    ['authentication', 'auth'],
    ['authorization', 'authz'],
    ['database', 'db'],
    ['application', 'app'],
    ['environment', 'env'],
    ['development', 'dev'],
    ['production', 'prod'],
    ['important', 'imp'],
    ['following', 'ff'],
    ['previous', 'prev'],
    ['additional', 'addl'],
    ['necessary', 'necc'],
    ['available', 'avail'],
    ['example', 'ex'],
  ]);

  // Words that can be safely removed in certain contexts
  private readonly fillerWords: string[] = [
    'very',
    'really',
    'quite',
    'just',
    'actually',
    'basically',
    'simply',
    'literally',
    'definitely',
    'certainly',
    'obviously',
  ];

  /**
   * Compress a prompt to reduce token usage
   * Returns both compressed prompt and compression stats
   */
  compress(prompt: string, options?: CompressionOptions): CompressionResult {
    const originalLength = prompt.length;
    const originalTokenEstimate = this.estimateTokens(prompt);

    let compressed = prompt;

    // Apply compression techniques based on options
    if (options?.removeExtraWhitespace !== false) {
      compressed = this.removeExtraWhitespace(compressed);
    }

    if (options?.abbreviateCommonWords !== false) {
      compressed = this.abbreviateCommonWords(compressed);
    }

    if (options?.removeFillerWords !== false) {
      compressed = this.removeFillerWords(compressed);
    }

    if (options?.compressFormatting !== false) {
      compressed = this.compressFormatting(compressed);
    }

    if (options?.removeRedundantPunctuation !== false) {
      compressed = this.removeRedundantPunctuation(compressed);
    }

    const compressedLength = compressed.length;
    const compressedTokenEstimate = this.estimateTokens(compressed);

    const compressionRatio = 1 - compressedLength / originalLength;
    const tokenReduction = 1 - compressedTokenEstimate / originalTokenEstimate;

    this.logger.debug(
      `Prompt compressed: ${originalLength} -> ${compressedLength} chars (${(compressionRatio * 100).toFixed(1)}% reduction, ~${(tokenReduction * 100).toFixed(1)}% token reduction)`,
    );

    return {
      original: prompt,
      compressed,
      stats: {
        originalLength,
        compressedLength,
        originalTokens: originalTokenEstimate,
        compressedTokens: compressedTokenEstimate,
        compressionRatio,
        tokenReduction,
        bytesSaved: originalLength - compressedLength,
      },
    };
  }

  /**
   * Remove extra whitespace (multiple spaces, tabs, newlines)
   */
  private removeExtraWhitespace(text: string): string {
    return text
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/ {2,}/g, ' ') // Multiple spaces to single space
      .replace(/\n /g, '\n') // Remove leading space after newline
      .replace(/ \n/g, '\n') // Remove trailing space before newline
      .trim();
  }

  /**
   * Abbreviate common words and phrases
   */
  private abbreviateCommonWords(text: string): string {
    let result = text;

    // Sort by length (longest first) to avoid partial replacements
    const sortedAbbreviations = Array.from(this.abbreviations.entries()).sort(
      (a, b) => b[0].length - a[0].length,
    );

    for (const [full, abbr] of sortedAbbreviations) {
      // Use word boundaries to avoid partial word replacement
      const regex = new RegExp(`\\b${full}\\b`, 'gi');
      result = result.replace(regex, abbr);
    }

    return result;
  }

  /**
   * Remove filler words that don't add semantic value
   */
  private removeFillerWords(text: string): string {
    let result = text;

    for (const word of this.fillerWords) {
      // Remove filler words at word boundaries
      const regex = new RegExp(`\\b${word}\\b\\s*`, 'gi');
      result = result.replace(regex, '');
    }

    return result;
  }

  /**
   * Compress formatting (lists, bullet points, etc.)
   */
  private compressFormatting(text: string): string {
    return text
      .replace(/•\s*/g, '- ') // Bullet points to dashes
      .replace(/→/g, '->') // Arrow to ASCII
      .replace(/"/g, '"') // Smart quotes to regular quotes
      .replace(/"/g, '"')
      .replace(/'/g, "'")
      .replace(/'/g, "'")
      .replace(/—/g, '-') // Em dash to regular dash
      .replace(/–/g, '-'); // En dash to regular dash
  }

  /**
   * Remove redundant punctuation
   */
  private removeRedundantPunctuation(text: string): string {
    return text
      .replace(/\.{2,}/g, '.') // Multiple periods to single period
      .replace(/!{2,}/g, '!') // Multiple exclamations to single
      .replace(/\?{2,}/g, '?') // Multiple question marks to single
      .replace(/,{2,}/g, ',') // Multiple commas to single
      .replace(/\s([,.!?])/g, '$1'); // Remove space before punctuation
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   * This is a simplified estimate - actual tokenization depends on the model
   */
  private estimateTokens(text: string): number {
    // GPT models: ~1 token per 4 characters on average
    return Math.ceil(text.length / 4);
  }

  /**
   * Compress a RAG context specifically
   * Applies additional RAG-specific optimizations
   */
  compressRAGContext(context: string, maxTokens?: number): CompressionResult {
    let result = this.compress(context, {
      removeExtraWhitespace: true,
      abbreviateCommonWords: true,
      removeFillerWords: true,
      compressFormatting: true,
      removeRedundantPunctuation: true,
    });

    // If still too long, apply aggressive truncation
    if (maxTokens && result.stats.compressedTokens > maxTokens) {
      const targetLength = maxTokens * 4; // Rough character count
      result.compressed = result.compressed.substring(0, targetLength) + '...';
      result.stats.compressedLength = result.compressed.length;
      result.stats.compressedTokens = this.estimateTokens(result.compressed);
      result.stats.tokenReduction =
        1 - result.stats.compressedTokens / result.stats.originalTokens;
      result.stats.compressionRatio =
        1 - result.stats.compressedLength / result.stats.originalLength;

      this.logger.warn(
        `Context truncated to ${maxTokens} tokens (${targetLength} chars)`,
      );
    }

    return result;
  }

  /**
   * Check if compression should be applied
   * Skip compression for very short prompts (< 100 tokens)
   */
  shouldCompress(prompt: string, minTokens: number = 100): boolean {
    const estimatedTokens = this.estimateTokens(prompt);
    return estimatedTokens >= minTokens;
  }

  /**
   * Batch compress multiple prompts
   */
  compressBatch(prompts: string[]): CompressionResult[] {
    return prompts.map((prompt) => this.compress(prompt));
  }

  /**
   * Get compression statistics summary
   */
  getCompressionStats(results: CompressionResult[]): CompressionStats {
    const totalOriginalTokens = results.reduce(
      (sum, r) => sum + r.stats.originalTokens,
      0,
    );
    const totalCompressedTokens = results.reduce(
      (sum, r) => sum + r.stats.compressedTokens,
      0,
    );
    const totalBytesSaved = results.reduce(
      (sum, r) => sum + r.stats.bytesSaved,
      0,
    );

    return {
      totalPrompts: results.length,
      totalOriginalTokens,
      totalCompressedTokens,
      totalTokensSaved: totalOriginalTokens - totalCompressedTokens,
      averageTokenReduction:
        results.reduce((sum, r) => sum + r.stats.tokenReduction, 0) /
        results.length,
      totalBytesSaved,
    };
  }
}

/**
 * Compression options
 */
export interface CompressionOptions {
  removeExtraWhitespace?: boolean;
  abbreviateCommonWords?: boolean;
  removeFillerWords?: boolean;
  compressFormatting?: boolean;
  removeRedundantPunctuation?: boolean;
}

/**
 * Compression result with original, compressed, and stats
 */
export interface CompressionResult {
  original: string;
  compressed: string;
  stats: {
    originalLength: number;
    compressedLength: number;
    originalTokens: number;
    compressedTokens: number;
    compressionRatio: number;
    tokenReduction: number;
    bytesSaved: number;
  };
}

/**
 * Aggregate compression statistics
 */
export interface CompressionStats {
  totalPrompts: number;
  totalOriginalTokens: number;
  totalCompressedTokens: number;
  totalTokensSaved: number;
  averageTokenReduction: number;
  totalBytesSaved: number;
}