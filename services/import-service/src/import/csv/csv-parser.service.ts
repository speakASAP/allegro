/**
 * CSV Parser Service
 */

import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { LoggerService } from '@allegro/shared';
import * as fs from 'fs';

@Injectable()
export class CsvParserService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Parse CSV file
   */
  async parseCsv(filePath: string, delimiter: string = ';'): Promise<any[]> {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter,
        bom: true, // Handle BOM
        trim: true,
      });

      this.logger.log('CSV parsed successfully', {
        filePath,
        recordCount: records.length,
      });

      return records;
    } catch (error: any) {
      this.logger.error('Failed to parse CSV', {
        filePath,
        error: error.message,
      });
      throw error;
    }
  }
}

