/**
 * Represents a notification template document for vector database ingestion
 */
export interface TemplateDocument {
  id: string;
  content: string;
  metadata: TemplateMetadata;
  embedding?: number[];
}

/**
 * Metadata associated with a template document
 */
export interface TemplateMetadata {
  // Core template information
  channel: string; // email, sms, push, in_app, webhook
  type: string; // TRANSACTIONAL, MARKETING, SYSTEM, ALERT
  category?: string; // user-defined category
  tags?: string[]; // searchable tags

  // Performance metrics
  openRate?: number; // 0.0 - 1.0
  clickRate?: number; // 0.0 - 1.0
  deliveryRate?: number; // 0.0 - 1.0
  unsubscribeRate?: number; // 0.0 - 1.0
  totalSent?: number;
  totalDelivered?: number;
  totalOpened?: number;
  totalClicked?: number;

  // Template characteristics
  subject?: string; // for email
  tone?: string; // professional, casual, urgent, friendly
  language?: string; // en, es, fr, etc.
  length?: number; // character count
  hasPersonalization?: boolean; // contains {{variables}}
  variables?: string[]; // list of variables used

  // Source information
  sourceId?: string; // original notification ID
  tenantId?: string; // for multi-tenancy
  version?: string; // template version

  // Temporal information
  createdAt: Date;
  updatedAt?: Date;
  lastUsedAt?: Date;
  usageCount?: number;

  // Quality indicators
  quality?: 'high' | 'medium' | 'low';
  confidence?: number; // 0.0 - 1.0
  isVerified?: boolean; // manually reviewed
}

/**
 * Raw notification data from database before processing
 */
export interface RawNotificationData {
  id: string;
  userId: string;
  tenantId?: string;
  eventId?: string;
  channel: string;
  type: string;
  subject?: string;
  content?: string;
  payload?: any;
  status: string;
  priority: string;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Batch processing result
 */
export interface BatchIngestionResult {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  documents: TemplateDocument[];
  errors: IngestionError[];
  processingTimeMs: number;
}

/**
 * Ingestion error details
 */
export interface IngestionError {
  sourceId: string;
  stage: 'extraction' | 'validation' | 'cleaning' | 'embedding' | 'storage';
  errorType: string;
  message: string;
  timestamp: Date;
}

/**
 * Data validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

/**
 * Data cleaning options
 */
export interface CleaningOptions {
  removeHtml?: boolean;
  normalizeWhitespace?: boolean;
  removeDuplicates?: boolean;
  minLength?: number;
  maxLength?: number;
  extractVariables?: boolean;
}
