/**
 * Sync Controller
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '@allegro/shared';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('db-to-allegro')
  @UseGuards(JwtAuthGuard)
  async syncDbToAllegro() {
    const result = await this.syncService.syncDbToAllegro();
    return { success: true, data: result };
  }

  @Post('allegro-to-db')
  @UseGuards(JwtAuthGuard)
  async syncAllegroToDb() {
    const result = await this.syncService.syncAllegroToDb();
    return { success: true, data: result };
  }

  @Post('bidirectional')
  @UseGuards(JwtAuthGuard)
  async bidirectionalSync() {
    const result = await this.syncService.bidirectionalSync();
    return { success: true, data: result };
  }

  @Post('product/:id')
  @UseGuards(JwtAuthGuard)
  async syncProduct(@Param('id') id: string) {
    const result = await this.syncService.syncProduct(id);
    return { success: true, data: result };
  }

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  async getJobs(@Query() query: any) {
    const result = await this.syncService.getSyncJobs(query);
    return { success: true, data: result };
  }

  @Get('jobs/:id')
  @UseGuards(JwtAuthGuard)
  async getJob(@Param('id') id: string) {
    const job = await this.syncService.getSyncJob(id);
    return { success: true, data: job };
  }
}

