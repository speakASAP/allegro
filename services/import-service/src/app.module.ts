/**
 * Import Service App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImportModule } from './import/import.module';
import { PrismaModule, LoggerModule, HealthModule } from '@allegro/shared';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    PrismaModule,
    LoggerModule,
    HealthModule,
    ImportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

