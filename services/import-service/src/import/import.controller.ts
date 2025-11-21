/**
 * Import Controller
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { ImportService } from './import.service';
import { JwtAuthGuard } from '@allegro/shared';
import * as fs from 'fs';
import * as path from 'path';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('csv')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    // Save file to uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, file.originalname);
    fs.writeFileSync(filePath, file.buffer);

    // Import CSV
    const result = await this.importService.importCsv(filePath, file.originalname);
    
    return { success: true, data: result };
  }

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  async listJobs(@Query() query: any) {
    const result = await this.importService.listImportJobs(query);
    return { success: true, data: result };
  }

  @Get('jobs/:id')
  @UseGuards(JwtAuthGuard)
  async getJob(@Param('id') id: string) {
    const job = await this.importService.getImportJob(id);
    return { success: true, data: job };
  }

  @Get('jobs/:id/status')
  @UseGuards(JwtAuthGuard)
  async getJobStatus(@Param('id') id: string) {
    const job = await this.importService.getImportJob(id);
    if (!job) {
      throw new Error(`Import job with ID ${id} not found`);
    }
    return {
      success: true,
      data: {
        id: job.id,
        status: job.status,
        totalRows: job.totalRows,
        processedRows: job.processedRows,
        successfulRows: job.successfulRows,
        failedRows: job.failedRows,
        skippedRows: job.skippedRows,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    };
  }

  @Post('jobs/:id/retry')
  @UseGuards(JwtAuthGuard)
  async retryJob(@Param('id') id: string) {
    const job = await this.importService.getImportJob(id);
    if (!job) {
      throw new Error(`Import job with ID ${id} not found`);
    }

    if (!job.filePath) {
      throw new Error(`Import job ${id} has no file path`);
    }

    // Retry import
    const result = await this.importService.importCsv(
      job.filePath,
      job.fileName,
      job.source,
    );

    return { success: true, data: result };
  }
}

