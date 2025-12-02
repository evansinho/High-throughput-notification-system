import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties exist
      transform: true, // Transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Automatically convert types
      },
    }),
  );

  // Global error handling filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enable CORS
  app.enableCors();

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
