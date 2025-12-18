import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsObject,
  MaxLength,
  MinLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

/**
 * Channel type for notifications
 */
export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app',
}

/**
 * Category type for notifications
 */
export enum NotificationCategory {
  TRANSACTIONAL = 'transactional',
  MARKETING = 'marketing',
  SYSTEM = 'system',
  ALERT = 'alert',
}

/**
 * Request DTO for generating notifications with AI
 */
export class GenerateAINotificationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  query!: string;

  @IsEnum(NotificationChannel)
  @IsOptional()
  channel?: NotificationChannel;

  @IsEnum(NotificationCategory)
  @IsOptional()
  category?: NotificationCategory;

  @IsObject()
  @IsOptional()
  context?: Record<string, any>;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  topK?: number = 5;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  scoreThreshold?: number = 0.7;

  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number = 0.7;

  @IsNumber()
  @Min(100)
  @Max(4000)
  @IsOptional()
  maxTokens?: number = 1000;
}

/**
 * Response DTO for AI-generated notifications
 */
export interface GenerateAINotificationResponse {
  success: boolean;
  data?: {
    notification: string;
    channel?: string;
    category?: string;
    metadata: {
      retrievedCount: number;
      generationTimeMs: number;
      tokensUsed: number;
      cost: number;
      sources: Array<{
        id: string;
        score: number;
        channel: string;
        category: string;
      }>;
    };
  };
  error?: string;
  requestId: string;
  timestamp: string;
}
