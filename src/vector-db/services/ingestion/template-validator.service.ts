import { Injectable, Logger } from '@nestjs/common';
import {
  TemplateDocument,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../../interfaces/template-document.interface';

/**
 * Service responsible for validating template documents
 */
@Injectable()
export class TemplateValidatorService {
  private readonly logger = new Logger(TemplateValidatorService.name);

  // Validation constraints
  private readonly MIN_CONTENT_LENGTH = 10;
  private readonly MAX_CONTENT_LENGTH = 10000;
  private readonly MAX_SUBJECT_LENGTH = 200;
  private readonly MAX_VARIABLES = 50;

  private readonly VALID_CHANNELS = [
    'email',
    'sms',
    'push',
    'in_app',
    'webhook',
  ];
  private readonly VALID_TYPES = [
    'TRANSACTIONAL',
    'MARKETING',
    'SYSTEM',
    'ALERT',
  ];
  private readonly VALID_TONES = [
    'professional',
    'casual',
    'urgent',
    'friendly',
    'formal',
  ];

  /**
   * Validate a template document
   */
  validate(template: TemplateDocument): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate ID
    if (!template.id || template.id.trim().length === 0) {
      errors.push({
        field: 'id',
        message: 'Template ID is required',
        severity: 'error',
      });
    }

    // Validate content
    this.validateContent(template, errors, warnings);

    // Validate metadata
    this.validateMetadata(template, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate content field
   */
  private validateContent(
    template: TemplateDocument,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const content = template.content;

    // Check if content exists
    if (!content || content.trim().length === 0) {
      errors.push({
        field: 'content',
        message: 'Content is required',
        severity: 'error',
      });
      return;
    }

    // Check minimum length
    if (content.length < this.MIN_CONTENT_LENGTH) {
      errors.push({
        field: 'content',
        message: `Content is too short (minimum ${this.MIN_CONTENT_LENGTH} characters)`,
        severity: 'error',
      });
    }

    // Check maximum length
    if (content.length > this.MAX_CONTENT_LENGTH) {
      errors.push({
        field: 'content',
        message: `Content is too long (maximum ${this.MAX_CONTENT_LENGTH} characters)`,
        severity: 'error',
      });
    }

    // Check for empty placeholders
    if (this.hasEmptyPlaceholders(content)) {
      warnings.push({
        field: 'content',
        message: 'Content contains empty placeholders like {{}} or ${}',
        suggestion: 'Remove or fill empty placeholders',
      });
    }

    // Check for suspicious patterns
    if (this.hasSuspiciousPatterns(content)) {
      warnings.push({
        field: 'content',
        message: 'Content contains potentially problematic patterns',
        suggestion: 'Review for SQL injection, XSS, or other security issues',
      });
    }
  }

  /**
   * Validate metadata field
   */
  private validateMetadata(
    template: TemplateDocument,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const metadata = template.metadata;

    if (!metadata) {
      errors.push({
        field: 'metadata',
        message: 'Metadata is required',
        severity: 'error',
      });
      return;
    }

    // Validate channel
    if (!metadata.channel) {
      errors.push({
        field: 'metadata.channel',
        message: 'Channel is required',
        severity: 'error',
      });
    } else if (!this.VALID_CHANNELS.includes(metadata.channel)) {
      errors.push({
        field: 'metadata.channel',
        message: `Invalid channel: ${metadata.channel}. Valid values: ${this.VALID_CHANNELS.join(', ')}`,
        severity: 'error',
      });
    }

    // Validate type
    if (!metadata.type) {
      errors.push({
        field: 'metadata.type',
        message: 'Type is required',
        severity: 'error',
      });
    } else if (!this.VALID_TYPES.includes(metadata.type)) {
      errors.push({
        field: 'metadata.type',
        message: `Invalid type: ${metadata.type}. Valid values: ${this.VALID_TYPES.join(', ')}`,
        severity: 'error',
      });
    }

    // Validate subject for emails
    if (metadata.channel === 'email') {
      if (!metadata.subject) {
        warnings.push({
          field: 'metadata.subject',
          message: 'Email templates should have a subject',
          suggestion: 'Add a subject line for better email delivery',
        });
      } else if (metadata.subject.length > this.MAX_SUBJECT_LENGTH) {
        warnings.push({
          field: 'metadata.subject',
          message: `Subject is too long (${metadata.subject.length} chars, recommended max: ${this.MAX_SUBJECT_LENGTH})`,
          suggestion:
            'Shorten subject line for better email client compatibility',
        });
      }
    }

    // Validate SMS length
    if (metadata.channel === 'sms') {
      if (template.content.length > 160) {
        warnings.push({
          field: 'content',
          message: `SMS content is ${template.content.length} characters (recommended max: 160 for single SMS)`,
          suggestion: 'Consider shortening message to fit in single SMS',
        });
      }
    }

    // Validate tone
    if (metadata.tone && !this.VALID_TONES.includes(metadata.tone)) {
      warnings.push({
        field: 'metadata.tone',
        message: `Unusual tone: ${metadata.tone}. Common values: ${this.VALID_TONES.join(', ')}`,
        suggestion: 'Use a standard tone value for better categorization',
      });
    }

    // Validate variables
    if (metadata.variables && metadata.variables.length > this.MAX_VARIABLES) {
      warnings.push({
        field: 'metadata.variables',
        message: `Too many variables (${metadata.variables.length}, max recommended: ${this.MAX_VARIABLES})`,
        suggestion: 'Simplify template or split into multiple templates',
      });
    }

    // Validate performance metrics
    this.validatePerformanceMetrics(metadata, errors, warnings);

    // Validate dates
    if (!metadata.createdAt) {
      errors.push({
        field: 'metadata.createdAt',
        message: 'Created date is required',
        severity: 'error',
      });
    } else if (metadata.createdAt > new Date()) {
      warnings.push({
        field: 'metadata.createdAt',
        message: 'Created date is in the future',
        suggestion: 'Verify the created date is correct',
      });
    }
  }

  /**
   * Validate performance metrics
   */
  private validatePerformanceMetrics(
    metadata: any,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const metrics = [
      'openRate',
      'clickRate',
      'deliveryRate',
      'unsubscribeRate',
    ];

    for (const metric of metrics) {
      if (metadata[metric] !== undefined) {
        const value = metadata[metric];
        if (typeof value !== 'number' || value < 0 || value > 1) {
          errors.push({
            field: `metadata.${metric}`,
            message: `${metric} must be a number between 0 and 1`,
            severity: 'error',
          });
        }
      }
    }

    // Check for logical inconsistencies
    if (metadata.totalSent && metadata.totalDelivered) {
      if (metadata.totalDelivered > metadata.totalSent) {
        errors.push({
          field: 'metadata.totalDelivered',
          message: 'totalDelivered cannot be greater than totalSent',
          severity: 'error',
        });
      }
    }

    if (metadata.totalDelivered && metadata.totalOpened) {
      if (metadata.totalOpened > metadata.totalDelivered) {
        warnings.push({
          field: 'metadata.totalOpened',
          message: 'totalOpened is greater than totalDelivered (unusual)',
          suggestion: 'Verify tracking data is correct',
        });
      }
    }
  }

  /**
   * Check for empty placeholders
   */
  private hasEmptyPlaceholders(content: string): boolean {
    const emptyPatterns = [
      /\{\{\s*\}\}/, // {{}}
      /\$\{\s*\}/, // ${}
      /\{\s*\}/, // {}
      /%\s*%/, // %%
    ];

    return emptyPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Check for suspicious patterns that might indicate security issues
   */
  private hasSuspiciousPatterns(content: string): boolean {
    const suspiciousPatterns = [
      /<script\b/i, // Script tags
      /javascript:/i, // JavaScript protocol
      /on\w+\s*=/i, // Event handlers (onclick, onerror, etc.)
      /eval\s*\(/i, // eval() function
      /DROP\s+TABLE/i, // SQL injection
      /DELETE\s+FROM/i, // SQL injection
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Batch validate templates
   */
  validateBatch(templates: TemplateDocument[]): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const template of templates) {
      const result = this.validate(template);
      results.set(template.id, result);
    }

    const validCount = Array.from(results.values()).filter(
      (r) => r.isValid,
    ).length;
    const invalidCount = results.size - validCount;

    this.logger.log(
      `Validated ${templates.length} templates: ${validCount} valid, ${invalidCount} invalid`,
    );

    return results;
  }
}
