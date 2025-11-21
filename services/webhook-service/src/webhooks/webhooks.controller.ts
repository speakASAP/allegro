/**
 * Webhooks Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '@allegro/shared';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {}

  @Post('allegro')
  async receiveAllegroWebhook(@Body() body: any) {
    // Verify webhook secret if configured
    const secret = this.configService.get<string>('WEBHOOK_SECRET');
    if (secret && body.secret !== secret) {
      throw new Error('Invalid webhook secret');
    }

    const eventType = body.type || body.eventType;
    const payload = body.payload || body;

    const result = await this.webhooksService.processEvent(eventType, payload);
    return { success: true, data: result };
  }

  @Get('events')
  @UseGuards(JwtAuthGuard)
  async getEvents(@Query() query: any) {
    const result = await this.webhooksService.getEvents(query);
    return { success: true, data: result };
  }

  @Get('events/:id')
  @UseGuards(JwtAuthGuard)
  async getEvent(@Param('id') id: string) {
    const event = await this.webhooksService.getEvent(id);
    return { success: true, data: event };
  }

  @Post('events/:id/retry')
  @UseGuards(JwtAuthGuard)
  async retryEvent(@Param('id') id: string) {
    const result = await this.webhooksService.retryEvent(id);
    return { success: true, data: result };
  }
}

