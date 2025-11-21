/**
 * Cleanup Old Jobs Task
 */

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService, LoggerService } from '@allegro/shared';

@Injectable()
export class CleanupOldJobsTask {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Cleanup old jobs - daily at 2 AM
   */
  @Cron('0 2 * * *')
  async execute() {
    this.logger.log('Running cleanup of old jobs');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    try {
      // Delete sync jobs older than 30 days
      const deletedSyncJobs = await this.prisma.syncJob.deleteMany({
        where: {
          createdAt: { lt: thirtyDaysAgo },
          status: { in: ['COMPLETED', 'FAILED'] },
        },
      });

      // Delete import jobs older than 90 days
      const deletedImportJobs = await this.prisma.importJob.deleteMany({
        where: {
          createdAt: { lt: ninetyDaysAgo },
          status: { in: ['COMPLETED', 'FAILED'] },
        },
      });

      // Delete webhook events older than 30 days
      const deletedWebhookEvents = await this.prisma.webhookEvent.deleteMany({
        where: {
          createdAt: { lt: thirtyDaysAgo },
          processed: true,
        },
      });

      this.logger.log('Cleanup completed', {
        deletedSyncJobs: deletedSyncJobs.count,
        deletedImportJobs: deletedImportJobs.count,
        deletedWebhookEvents: deletedWebhookEvents.count,
      });
    } catch (error: any) {
      this.logger.error('Cleanup failed', {
        error: error.message,
      });
    }
  }
}

