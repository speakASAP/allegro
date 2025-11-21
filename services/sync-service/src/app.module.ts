/**
 * Sync Service App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncModule } from './sync/sync.module';
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
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

