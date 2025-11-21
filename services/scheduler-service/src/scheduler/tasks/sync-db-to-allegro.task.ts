/**
 * Sync DB to Allegro Task
 */

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SyncDbToAllegroTask {
  private readonly syncServiceUrl: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.syncServiceUrl = this.configService.get<string>('SYNC_SERVICE_URL');
    if (!this.syncServiceUrl) {
      throw new Error('Missing required environment variable: SYNC_SERVICE_URL. Please set it in your .env file.');
    }
  }

  /**
   * Sync DB to Allegro - every 15 minutes
   */
  @Cron(process.env.SYNC_DB_TO_ALLEGRO_INTERVAL || '*/15 * * * *') // Fallback for cron expression only
  async execute() {
    this.logger.log('Running scheduled DB to Allegro sync');
    try {
      await firstValueFrom(
        this.httpService.post(`${this.syncServiceUrl}/sync/db-to-allegro`),
      );
      this.logger.log('Scheduled DB to Allegro sync completed');
    } catch (error: any) {
      this.logger.error('Scheduled DB to Allegro sync failed', {
        error: error.message,
      });
    }
  }
}

