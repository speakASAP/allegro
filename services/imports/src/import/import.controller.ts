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
  HttpException,
  HttpStatus,
  UnauthorizedException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { JwtAuthGuard, LoggerService } from '@allegro/shared';
import * as fs from 'fs';
import * as path from 'path';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('import')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('ImportController');
  }

  @Post('csv')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(@UploadedFile() file: MulterFile | undefined) {
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
  async listJobs(@Query() query: any): Promise<{ success: boolean; data: any }> {
    try {
      const result = await this.importService.listImportJobs(query);
      this.logger.log('Import jobs fetched', {
        total: result?.pagination?.total,
        page: result?.pagination?.page,
        limit: result?.pagination?.limit,
      });
      return { success: true, data: result };
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        this.logger.warn('Unauthorized when listing import jobs', {
          message: error.message,
        });
        throw error;
      }

      this.logger.error('Failed to list import jobs', {
        error: error.message,
      });

      throw new HttpException(
        {
          success: false,
          error: {
            code: 'IMPORT_JOBS_ERROR',
            message: 'Failed to load import jobs. Please try again later.',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('jobs/:id')
  @UseGuards(JwtAuthGuard)
  async getJob(@Param('id') id: string): Promise<{ success: boolean; data: any }> {
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

