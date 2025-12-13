/**
 * Settings Service App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { SettingsModule } from './settings/settings.module';
import { PrismaModule, LoggerModule, AuthModule, NotificationModule } from '@allegro/shared';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '../../.env'),
    }),
    PrismaModule,
    LoggerModule,
    AuthModule,
    NotificationModule,
    SettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
