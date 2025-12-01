/**
 * Events Service
 * Handles event polling from Allegro API
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '@allegro/shared';
import { AllegroApiService } from '../allegro-api.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
  ) {}

  /**
   * Get offer events from Allegro API
   * @param after - Event ID to start after (Allegro uses 'after' parameter)
   */
  async getOfferEvents(after?: string, limit: number = 100) {
    this.logger.log('Fetching offer events from Allegro', { after, limit });
    try {
      const events = await this.allegroApi.getOfferEvents(after, limit);
      return events;
    } catch (error: any) {
      this.logger.error('Failed to fetch offer events', {
        error: error.message,
        after,
        limit,
      });
      throw error;
    }
  }

  /**
   * Get order events from Allegro API
   * Note: May return empty if endpoint doesn't exist
   */
  async getOrderEvents(after?: string, limit: number = 100) {
    this.logger.log('Fetching order events from Allegro', { after, limit });
    try {
      const events = await this.allegroApi.getOrderEvents(after, limit);
      return events;
    } catch (error: any) {
      // If endpoint doesn't exist, return empty events
      this.logger.warn('Order events endpoint may not be available', {
        error: error.message,
      });
      return { events: [], lastEventId: after || null };
    }
  }
}

