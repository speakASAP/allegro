/**
 * Scheduler Service
 * Handles scheduled cron jobs for synchronization
 * Note: Actual cron tasks are in separate task files
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '@allegro/shared';

@Injectable()
export class SchedulerService {
  constructor(private readonly logger: LoggerService) {
    this.logger.log('Scheduler Service initialized');
  }
}

