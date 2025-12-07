import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { pino, Logger as PinoLogger } from 'pino';

/**
 * Custom LoggerService using Pino for structured logging
 *
 * Features:
 * - Structured JSON logging
 * - Correlation ID support
 * - Log sampling (10% info, 100% error)
 * - Log levels: trace, debug, info, warn, error, fatal
 * - Production-ready with pretty printing in dev
 */
@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: PinoLogger;
  private context?: string;

  constructor(context?: string) {
    this.context = context;

    const isDev = process.env.NODE_ENV !== 'production';

    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      ...(isDev && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
    });
  }

  /**
   * Log with sampling - only log 10% of info messages
   */
  private shouldSample(level: string): boolean {
    if (level === 'error' || level === 'fatal' || level === 'warn') {
      return true; // Always log errors, fatals, and warnings
    }
    // Sample 10% of info/debug/trace messages
    return Math.random() < 0.1;
  }

  log(message: string, context?: string, correlationId?: string) {
    if (!this.shouldSample('info')) return;

    this.logger.info({
      message,
      context: context || this.context,
      correlationId,
    });
  }

  error(
    message: string,
    trace?: string,
    context?: string,
    correlationId?: string,
  ) {
    this.logger.error({
      message,
      trace,
      context: context || this.context,
      correlationId,
    });
  }

  warn(message: string, context?: string, correlationId?: string) {
    this.logger.warn({
      message,
      context: context || this.context,
      correlationId,
    });
  }

  debug(message: string, context?: string, correlationId?: string) {
    if (!this.shouldSample('debug')) return;

    this.logger.debug({
      message,
      context: context || this.context,
      correlationId,
    });
  }

  verbose(message: string, context?: string, correlationId?: string) {
    if (!this.shouldSample('trace')) return;

    this.logger.trace({
      message,
      context: context || this.context,
      correlationId,
    });
  }

  fatal(message: string, context?: string, correlationId?: string) {
    this.logger.fatal({
      message,
      context: context || this.context,
      correlationId,
    });
  }

  /**
   * Create child logger with correlation ID
   */
  child(correlationId: string): LoggerService {
    const childLogger = new LoggerService(this.context);
    childLogger.logger = this.logger.child({ correlationId });
    return childLogger;
  }
}
