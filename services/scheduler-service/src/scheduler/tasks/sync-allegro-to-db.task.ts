/**
 * Sync Allegro to DB Task
 */

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SyncAllegroToDbTask {
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
   * Sync Allegro to DB - every 30 minutes
   */
  @Cron(process.env.SYNC_ALLEGRO_TO_DB_INTERVAL || '*/30 * * * *')
  async execute() {
    this.logger.log('Running scheduled Allegro to DB sync');
    try {
      await firstValueFrom(
        this.httpService.post(`${this.syncServiceUrl}/sync/allegro-to-db`),
      );
      this.logger.log('Scheduled Allegro to DB sync completed');
    } catch (error: any) {
      this.logger.error('Scheduled Allegro to DB sync failed', {
        error: error.message,
      });
    }
  }
}

