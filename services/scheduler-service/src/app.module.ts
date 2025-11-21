/**
 * Scheduler Service App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerModule } from './scheduler/scheduler.module';
import { PrismaModule, LoggerModule, HealthModule } from '@allegro/shared';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    LoggerModule,
    HealthModule,
    SchedulerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

