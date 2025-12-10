/**
 * Settings Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { PrismaModule, LoggerModule, NotificationModule, AuthModule } from '@allegro/shared';

@Module({
  imports: [
    PrismaModule,
    LoggerModule,
    NotificationModule,
    AuthModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: (() => {
          const authTimeout = configService.get<string>('AUTH_SERVICE_TIMEOUT');
          const httpTimeout = configService.get<string>('HTTP_TIMEOUT');
          const timeout = authTimeout || httpTimeout;
          if (!timeout) {
            throw new Error('AUTH_SERVICE_TIMEOUT or HTTP_TIMEOUT must be configured in .env file');
          }
          return parseInt(timeout);
        })(),
        maxRedirects: 5,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
