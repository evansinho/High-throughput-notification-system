import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * CorrelationIdMiddleware - Adds correlation ID to every request
 *
 * Features:
 * - Generates UUID v4 correlation ID for each request
 * - Accepts existing correlation ID from X-Correlation-ID header
 * - Adds correlation ID to response headers
 * - Stores correlation ID in request object for easy access
 *
 * Usage:
 * - Access via req.correlationId in controllers
 * - Pass to logger.child(correlationId) for traced logs
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Check if correlation ID already exists in request header
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();

    // Attach correlation ID to request object
    (req as any).correlationId = correlationId;

    // Add correlation ID to response headers for client tracking
    res.setHeader('X-Correlation-ID', correlationId);

    next();
  }
}
