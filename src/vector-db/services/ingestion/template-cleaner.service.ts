import { Injectable, Logger } from '@nestjs/common';
import {
  TemplateDocument,
  CleaningOptions,
} from '../../interfaces/template-document.interface';

/**
 * Service responsible for cleaning and normalizing template documents
 */
@Injectable()
export class TemplateCleanerService {
  private readonly logger = new Logger(TemplateCleanerService.name);

  /**
   * Clean a template document
   */
  clean(
    template: TemplateDocument,
    options: CleaningOptions = {},
  ): TemplateDocument {
    const cleaned = { ...template };

    // Clean content
    cleaned.content = this.cleanContent(template.content, options);

    // Update length in metadata
    if (cleaned.metadata) {
      cleaned.metadata = {
        ...cleaned.metadata,
        length: cleaned.content.length,
      };

      // Re-extract variables if requested
      if (options.extractVariables) {
        const variables = this.extractVariables(cleaned.content);
        cleaned.metadata.variables = variables;
        cleaned.metadata.hasPersonalization = variables.length > 0;
      }
    }

    return cleaned;
  }

  /**
   * Clean content string
   */
  private cleanContent(content: string, options: CleaningOptions): string {
    let cleaned = content;

    // Remove HTML tags if requested
    if (options.removeHtml) {
      cleaned = this.removeHtml(cleaned);
    }

    // Normalize whitespace if requested
    if (options.normalizeWhitespace !== false) {
      cleaned = this.normalizeWhitespace(cleaned);
    }

    // Apply length constraints
    if (options.minLength && cleaned.length < options.minLength) {
      this.logger.warn(
        `Content too short after cleaning: ${cleaned.length} < ${options.minLength}`,
      );
    }

    if (options.maxLength && cleaned.length > options.maxLength) {
      cleaned = cleaned.substring(0, options.maxLength);
      this.logger.debug(`Content truncated to ${options.maxLength} characters`);
    }

    return cleaned.trim();
  }

  /**
   * Remove HTML tags from content
   */
  private removeHtml(content: string): string {
    let cleaned = content;

    // Remove style and script tags with their content
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    // Convert common HTML entities to text
    cleaned = cleaned.replace(/&nbsp;/g, ' ');
    cleaned = cleaned.replace(/&quot;/g, '"');
    cleaned = cleaned.replace(/&apos;/g, "'");
    cleaned = cleaned.replace(/&lt;/g, '<');
    cleaned = cleaned.replace(/&gt;/g, '>');
    cleaned = cleaned.replace(/&amp;/g, '&');

    // Convert line breaks to newlines
    cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
    cleaned = cleaned.replace(/<\/p>/gi, '\n\n');
    cleaned = cleaned.replace(/<\/div>/gi, '\n');
    cleaned = cleaned.replace(/<\/li>/gi, '\n');

    // Remove all remaining HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, '');

    // Decode remaining HTML entities
    cleaned = this.decodeHtmlEntities(cleaned);

    return cleaned;
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&quot;': '"',
      '&apos;': "'",
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&#39;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#47;': '/',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // Decode numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (_match, dec) => {
      return String.fromCharCode(dec);
    });

    decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (_match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    return decoded;
  }

  /**
   * Normalize whitespace
   */
  private normalizeWhitespace(content: string): string {
    let normalized = content;

    // Replace multiple spaces with single space
    normalized = normalized.replace(/[ \t]+/g, ' ');

    // Replace multiple newlines with double newline (preserve paragraph breaks)
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    // Remove leading/trailing whitespace from each line
    normalized = normalized
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

    // Remove empty lines at start and end
    normalized = normalized.trim();

    return normalized;
  }

  /**
   * Extract variables from content
   */
  private extractVariables(content: string): string[] {
    const variables = new Set<string>();

    // Match {{variable}}
    const curlyBracePattern = /\{\{([^}]+)\}\}/g;
    let match = curlyBracePattern.exec(content);
    while (match !== null) {
      variables.add(match[1].trim());
      match = curlyBracePattern.exec(content);
    }

    // Match {variable}
    const singleBracePattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    match = singleBracePattern.exec(content);
    while (match !== null) {
      variables.add(match[1].trim());
      match = singleBracePattern.exec(content);
    }

    // Match ${variable}
    const dollarBracePattern = /\$\{([^}]+)\}/g;
    match = dollarBracePattern.exec(content);
    while (match !== null) {
      variables.add(match[1].trim());
      match = dollarBracePattern.exec(content);
    }

    // Match %variable%
    const percentPattern = /%([a-zA-Z_][a-zA-Z0-9_]*)%/g;
    match = percentPattern.exec(content);
    while (match !== null) {
      variables.add(match[1].trim());
      match = percentPattern.exec(content);
    }

    return Array.from(variables);
  }

  /**
   * Remove duplicate templates based on content similarity
   */
  removeDuplicates(templates: TemplateDocument[]): TemplateDocument[] {
    const seen = new Map<string, TemplateDocument>();
    const deduplicated: TemplateDocument[] = [];

    for (const template of templates) {
      // Create a normalized version for comparison
      const normalized = this.normalizeForComparison(template.content);

      if (!seen.has(normalized)) {
        seen.set(normalized, template);
        deduplicated.push(template);
      } else {
        this.logger.debug(
          `Duplicate template detected: ${template.id} (similar to ${seen.get(normalized)?.id})`,
        );
      }
    }

    this.logger.log(
      `Removed ${templates.length - deduplicated.length} duplicate templates`,
    );

    return deduplicated;
  }

  /**
   * Normalize content for comparison
   */
  private normalizeForComparison(content: string): string {
    let normalized = content.toLowerCase();

    // Remove all whitespace
    normalized = normalized.replace(/\s+/g, '');

    // Remove variable placeholders (they might differ but template is same)
    normalized = normalized.replace(/\{\{[^}]+\}\}/g, '{{VAR}}');
    normalized = normalized.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, '{VAR}');
    normalized = normalized.replace(/\$\{[^}]+\}/g, '${VAR}');
    normalized = normalized.replace(/%[a-zA-Z_][a-zA-Z0-9_]*%/g, '%VAR%');

    return normalized;
  }

  /**
   * Batch clean templates
   */
  cleanBatch(
    templates: TemplateDocument[],
    options: CleaningOptions = {},
  ): TemplateDocument[] {
    let cleaned = templates.map((template) => this.clean(template, options));

    // Remove duplicates if requested
    if (options.removeDuplicates) {
      cleaned = this.removeDuplicates(cleaned);
    }

    this.logger.log(`Cleaned ${cleaned.length} templates`);

    return cleaned;
  }

  /**
   * Sanitize content for security
   */
  sanitize(content: string): string {
    let sanitized = content;

    // Remove script tags
    sanitized = sanitized.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      '',
    );

    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

    // Remove javascript: protocol
    sanitized = sanitized.replace(/javascript:/gi, '');

    // Remove data: protocol (can be used for XSS)
    sanitized = sanitized.replace(/data:text\/html/gi, '');

    return sanitized;
  }
}
