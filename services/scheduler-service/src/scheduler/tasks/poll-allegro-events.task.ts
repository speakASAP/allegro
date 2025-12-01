/**
 * Poll Allegro Events Task
 * Polls Allegro API for offer and order events
 */

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PollAllegroEventsTask {
  private readonly webhookServiceUrl: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.webhookServiceUrl = this.configService.get<string>('WEBHOOK_SERVICE_URL');
    if (!this.webhookServiceUrl) {
      throw new Error('Missing required environment variable: WEBHOOK_SERVICE_URL. Please set it in your .env file.');
    }
  }

  /**
   * Poll Allegro events - every 37 minutes by default
   */
  @Cron(process.env.EVENT_POLLING_INTERVAL || '*/37 * * * *')
  async execute() {
    this.logger.log('Running scheduled Allegro event polling');
    try {
      await firstValueFrom(
        this.httpService.post(`${this.webhookServiceUrl}/webhooks/poll-events`),
      );
      this.logger.log('Scheduled Allegro event polling completed');
    } catch (error: any) {
      this.logger.error('Scheduled Allegro event polling failed', {
        error: error.message,
      });
    }
  }
}

