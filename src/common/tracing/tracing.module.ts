import { Module, Global } from '@nestjs/common';
import { TracingService } from './tracing.service';

/**
 * TracingModule - Global module for distributed tracing
 *
 * Makes TracingService available throughout the application
 * for creating custom spans and adding trace attributes
 */
@Global()
@Module({
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {}
