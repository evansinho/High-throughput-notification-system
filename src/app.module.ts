import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
