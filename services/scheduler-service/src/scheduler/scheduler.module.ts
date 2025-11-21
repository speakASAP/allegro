/**
 * Scheduler Module
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule, PrismaModule } from '@allegro/shared';
import { SchedulerService } from './scheduler.service';
import { SyncDbToAllegroTask } from './tasks/sync-db-to-allegro.task';
import { SyncAllegroToDbTask } from './tasks/sync-allegro-to-db.task';
import { InventorySyncTask } from './tasks/inventory-sync.task';
import { CleanupOldJobsTask } from './tasks/cleanup-old-jobs.task';

@Module({
  imports: [ScheduleModule.forRoot(), HttpModule, ConfigModule, LoggerModule, PrismaModule],
  providers: [
    SchedulerService,
    SyncDbToAllegroTask,
    SyncAllegroToDbTask,
    InventorySyncTask,
    CleanupOldJobsTask,
  ],
})
export class SchedulerModule {}

