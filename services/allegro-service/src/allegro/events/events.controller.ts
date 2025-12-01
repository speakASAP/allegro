/**
 * Events Controller
 * Internal endpoints for event polling (no auth required for internal service calls)
 */

import { Controller, Get, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('allegro/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('offers')
  async getOfferEvents(@Query() query: { after?: string; limit?: number }): Promise<{ success: boolean; data: any }> {
    const result = await this.eventsService.getOfferEvents(query.after, query.limit);
    return { success: true, data: result };
  }

  @Get('orders')
  async getOrderEvents(@Query() query: { after?: string; limit?: number }): Promise<{ success: boolean; data: any }> {
    const result = await this.eventsService.getOrderEvents(query.after, query.limit);
    return { success: true, data: result };
  }
}

