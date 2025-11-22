/**
 * Webhook Service App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PrismaModule, LoggerModule, HealthModule, NotificationModule } from '@allegro/shared';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '../../.env'),
    }),
    PrismaModule,
    LoggerModule,
    HealthModule,
    NotificationModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

