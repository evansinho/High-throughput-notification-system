import { Injectable, Logger } from '@nestjs/common';
import {
  RawNotificationData,
  TemplateDocument,
  TemplateMetadata,
} from '../../interfaces/template-document.interface';

/**
 * Service responsible for extracting template documents from raw notification data
 */
@Injectable()
export class TemplateExtractorService {
  private readonly logger = new Logger(TemplateExtractorService.name);

  /**
   * Extract a template document from raw notification data
   */
  extractTemplate(rawData: RawNotificationData): TemplateDocument | null {
    try {
      // Extract content from various sources
      const content = this.extractContent(rawData);
      if (!content) {
        this.logger.debug(`No content found for notification ${rawData.id}`);
        return null;
      }

      // Extract metadata
      const metadata = this.extractMetadata(rawData, content);

      return {
        id: rawData.id,
        content,
        metadata,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to extract template from ${rawData.id}: ${errorMessage}`,
        errorStack,
      );
      return null;
    }
  }

  /**
   * Extract content from notification data
   * Priority: payload.body > payload.text > payload.html > content > subject
   */
  private extractContent(rawData: RawNotificationData): string | null {
    // Try payload first (channel-specific)
    if (rawData.payload) {
      // Email: try body, html, text
      if (rawData.channel === 'email') {
        if (rawData.payload.body) return rawData.payload.body;
        if (rawData.payload.html) return rawData.payload.html;
        if (rawData.payload.text) return rawData.payload.text;
      }

      // SMS: try message, body, text
      if (rawData.channel === 'sms') {
        if (rawData.payload.message) return rawData.payload.message;
        if (rawData.payload.body) return rawData.payload.body;
        if (rawData.payload.text) return rawData.payload.text;
      }

      // Push: try body, message, alert
      if (rawData.channel === 'push') {
        if (rawData.payload.body) return rawData.payload.body;
        if (rawData.payload.message) return rawData.payload.message;
        if (rawData.payload.alert) return rawData.payload.alert;
      }

      // In-app: try content, message, body
      if (rawData.channel === 'in_app') {
        if (rawData.payload.content) return rawData.payload.content;
        if (rawData.payload.message) return rawData.payload.message;
        if (rawData.payload.body) return rawData.payload.body;
      }

      // Webhook: try payload as JSON string
      if (rawData.channel === 'webhook') {
        if (rawData.payload.body) return rawData.payload.body;
        // For webhooks, we might want to stringify the entire payload
        return JSON.stringify(rawData.payload);
      }
    }

    // Fallback to deprecated content field
    if (rawData.content) {
      return rawData.content;
    }

    // Last resort: use subject (for emails without body)
    if (rawData.subject && rawData.channel === 'email') {
      return rawData.subject;
    }

    return null;
  }

  /**
   * Extract metadata from notification data
   */
  private extractMetadata(
    rawData: RawNotificationData,
    content: string,
  ): TemplateMetadata {
    const metadata: TemplateMetadata = {
      channel: rawData.channel,
      type: rawData.type,
      sourceId: rawData.id,
      tenantId: rawData.tenantId || undefined,
      createdAt: rawData.createdAt,
      updatedAt: rawData.updatedAt,
    };

    // Add subject for emails
    if (rawData.subject) {
      metadata.subject = rawData.subject;
    }

    // Extract variables from content
    const variables = this.extractVariables(content);
    if (variables.length > 0) {
      metadata.hasPersonalization = true;
      metadata.variables = variables;
    } else {
      metadata.hasPersonalization = false;
    }

    // Add content length
    metadata.length = content.length;

    // Extract tags from metadata if available
    if (rawData.metadata && rawData.metadata.tags) {
      metadata.tags = Array.isArray(rawData.metadata.tags)
        ? rawData.metadata.tags
        : [rawData.metadata.tags];
    }

    // Extract category from metadata
    if (rawData.metadata && rawData.metadata.category) {
      metadata.category = rawData.metadata.category;
    }

    // Extract tone from metadata
    if (rawData.metadata && rawData.metadata.tone) {
      metadata.tone = rawData.metadata.tone;
    }

    // Extract language from metadata
    if (rawData.metadata && rawData.metadata.language) {
      metadata.language = rawData.metadata.language;
    }

    // Set lastUsedAt to sentAt if available
    if (rawData.sentAt) {
      metadata.lastUsedAt = rawData.sentAt;
    }

    return metadata;
  }

  /**
   * Extract template variables from content
   * Supports: {{variable}}, {variable}, ${variable}, %variable%
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
   * Batch extract templates from multiple notifications
   */
  extractBatch(rawDataList: RawNotificationData[]): TemplateDocument[] {
    const templates: TemplateDocument[] = [];

    for (const rawData of rawDataList) {
      const template = this.extractTemplate(rawData);
      if (template) {
        templates.push(template);
      }
    }

    this.logger.log(
      `Extracted ${templates.length} templates from ${rawDataList.length} notifications`,
    );

    return templates;
  }
}
