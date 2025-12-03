import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    rawBody: true,
  });

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // Global validation pipe with enhanced security
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties exist
      transform: true, // Transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Automatically convert types
      },
      // Additional security options
      disableErrorMessages: process.env.NODE_ENV === 'production', // Hide detailed errors in production
      validationError: {
        target: false, // Don't expose target object
        value: false, // Don't expose submitted values
      },
    }),
  );

  // Global error handling filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enhanced CORS configuration
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || []
        : true, // Allow all in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 86400, // 24 hours
  });

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Handle SIGTERM signal (e.g., from Docker, Kubernetes)
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM signal received: gracefully shutting down...');
    await app.close();
    logger.log('Application closed successfully');
    process.exit(0);
  });

  // Handle SIGINT signal (e.g., Ctrl+C)
  process.on('SIGINT', async () => {
    logger.log('SIGINT signal received: gracefully shutting down...');
    await app.close();
    logger.log('Application closed successfully');
    process.exit(0);
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
