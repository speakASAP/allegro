/**
 * Allegro Service App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { AllegroModule } from './allegro/allegro.module';
import { PrismaModule, LoggerModule, HealthModule } from '@allegro/shared';
import { HealthController } from './health/health.controller';
import { CredentialSelfReporter } from './health/credential-self-reporter';
import { BusinessHealthModule } from './business-health/business-health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '../../.env'),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    LoggerModule,
    HealthModule,
    AllegroModule,
    BusinessHealthModule,
  ],
  controllers: [HealthController],
  providers: [CredentialSelfReporter],
})
export class AppModule {}

