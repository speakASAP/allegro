/**
 * Inventory Sync Task
 */

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class InventorySyncTask {
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
   * Inventory sync - every 10 minutes
   */
  @Cron(process.env.SYNC_INVENTORY_INTERVAL || '*/10 * * * *')
  async execute() {
    this.logger.log('Running scheduled inventory sync');
    try {
      await firstValueFrom(
        this.httpService.post(`${this.syncServiceUrl}/sync/bidirectional`),
      );
      this.logger.log('Scheduled inventory sync completed');
    } catch (error: any) {
      this.logger.error('Scheduled inventory sync failed', {
        error: error.message,
      });
    }
  }
}

