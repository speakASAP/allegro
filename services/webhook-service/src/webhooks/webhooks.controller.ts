/**
 * Webhooks Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, JwtAuthGuard } from '@allegro/shared';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new LoggerService();

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext(WebhooksController.name);
  }

  @Post('poll-events')
  async pollEvents(): Promise<{ success: boolean; data: any }> {
    const result = await this.webhooksService.pollEvents();
    return { success: true, data: result };
  }

  @Get('events')
  @UseGuards(JwtAuthGuard)
  async getEvents(@Query() query: any): Promise<{ success: boolean; data: any }> {
    const result = await this.webhooksService.getEvents(query);
    return { success: true, data: result };
  }

  @Get('events/:id')
  @UseGuards(JwtAuthGuard)
  async getEvent(@Param('id') id: string): Promise<{ success: boolean; data: any }> {
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

