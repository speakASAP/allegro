/**
 * BizBox Parser Service
 * Specialized parser for BizBox CSV format
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '@allegro/shared';
import { CsvParserService } from './csv-parser.service';

@Injectable()
export class BizboxParserService {
  constructor(
    private readonly logger: LoggerService,
    private readonly csvParser: CsvParserService,
  ) {}

  /**
   * Parse BizBox CSV file
   */
  async parseBizBoxCsv(filePath: string): Promise<any[]> {
    this.logger.log('Parsing BizBox CSV', { filePath });

    // BizBox uses semicolon delimiter
    const records = await this.csvParser.parseCsv(filePath, ';');

    // Validate and normalize BizBox-specific fields
    const normalizedRecords = records.map((record, index) => {
      try {
        return this.normalizeBizBoxRecord(record, index + 1);
      } catch (error: any) {
        this.logger.warn('Failed to normalize BizBox record', {
          row: index + 1,
          error: error.message,
        });
        return record;
      }
    });

    this.logger.log('BizBox CSV parsed successfully', {
      filePath,
      recordCount: normalizedRecords.length,
    });

    return normalizedRecords;
  }

  /**
   * Normalize BizBox record
   */
  private normalizeBizBoxRecord(record: any, rowNumber: number): any {
    // Ensure required fields exist
    if (!record.code) {
      throw new Error(`Missing required field 'code' in row ${rowNumber}`);
    }

    // Normalize field names (handle language-specific fields)
    const normalized: any = {
      ...record,
      // Ensure code is always present
      code: record.code || `ROW_${rowNumber}`,
    };

    // Handle Czech language fields
    if (record['name:cs']) {
      normalized.name = record['name:cs'];
      normalized.nameCs = record['name:cs'];
    }

    if (record['description:cs']) {
      normalized.description = record['description:cs'];
      normalized.descriptionCs = record['description:cs'];
    }

    // Parse JSON fields if they exist as strings
    if (typeof record.bigImages === 'string' && record.bigImages) {
      try {
        normalized.bigImages = JSON.parse(record.bigImages);
      } catch {
        // If not JSON, treat as comma-separated
        normalized.bigImages = record.bigImages.split(',').map((img: string) => img.trim());
      }
    }

    if (typeof record.galleryImages === 'string' && record.galleryImages) {
      try {
        normalized.galleryImages = JSON.parse(record.galleryImages);
      } catch {
        normalized.galleryImages = record.galleryImages.split(',').map((img: string) => img.trim());
      }
    }

    return normalized;
  }
}

