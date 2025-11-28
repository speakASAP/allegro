/**
 * Settings Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { PrismaModule, LoggerModule, NotificationModule, AuthModule } from '@allegro/shared';

@Module({
  imports: [
    PrismaModule,
    LoggerModule,
    NotificationModule,
    AuthModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
