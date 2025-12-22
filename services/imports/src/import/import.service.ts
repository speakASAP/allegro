/**
 * Import Service
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, LoggerService, CatalogClientService, WarehouseClientService } from '@allegro/shared';
import { CsvParserService } from './csv/csv-parser.service';
import { BizboxParserService } from './csv/bizbox-parser.service';
import { BizboxToAllegroService } from './transformer/bizbox-to-allegro.service';
import { FieldMapperService } from './transformer/field-mapper.service';

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly csvParser: CsvParserService,
    private readonly bizboxParser: BizboxParserService,
    private readonly transformer: BizboxToAllegroService,
    private readonly fieldMapper: FieldMapperService,
    private readonly catalogClient: CatalogClientService,
    private readonly warehouseClient: WarehouseClientService,
  ) {}

  /**
   * Import CSV file
   */
  async importCsv(filePath: string, fileName: string, source: string = 'BIZBOX') {
    this.logger.log('Starting CSV import', { filePath, fileName, source });

    // Create import job
    const importJob = await this.prisma.importJob.create({
      data: {
        fileName,
        filePath,
        source,
        status: 'PROCESSING',
        startedAt: new Date(),
      },
    });

    try {
      // Parse CSV using BizBox parser
      const records = await this.bizboxParser.parseBizBoxCsv(filePath);
      
      await this.prisma.importJob.update({
        where: { id: importJob.id },
        data: { totalRows: records.length },
      });

      // Process records in batches
      const batchSize = parseInt(this.configService.get<string>('IMPORT_CSV_BATCH_SIZE') || '50');
      let processedRows = 0;
      let successfulRows = 0;
      let failedRows = 0;
      const errors: any[] = [];

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        for (const record of batch) {
          try {
            // Transform to Allegro format
            const allegroData = this.transformer.transform(record);

            // Create or update product in catalog-microservice
            const productName = record['name:cs'] || record.name;
            const productDescription = record['description:cs'] || record.description;
            const stockQuantity = this.calculateStock(record);
            
            let product;
            try {
              // Try to find existing product by SKU (code)
              product = await this.catalogClient.getProductBySku(record.code);
              if (product) {
                // Update product
                product = await this.catalogClient.updateProduct(product.id, {
                  title: productName,
                  description: productDescription,
                  ean: record.ean || undefined,
                  manufacturerCode: record.manufacturerCode || undefined,
                });
              } else {
                // Create new product
                product = await this.catalogClient.createProduct({
                  sku: record.code,
                  title: productName,
                  description: productDescription,
                  ean: record.ean || undefined,
                  manufacturerCode: record.manufacturerCode || undefined,
                });
              }
            } catch (error: any) {
              this.logger.error(`Failed to create/update product in catalog-microservice: ${error.message}`, error.stack, 'ImportService');
              throw error;
            }

            // Update stock in warehouse-microservice
            if (product && product.id) {
              try {
                const warehouseId = this.configService.get<string>('DEFAULT_WAREHOUSE_ID') || '1';
                await this.warehouseClient.setStock(
                  product.id,
                  warehouseId,
                  stockQuantity,
                  `Stock imported from CSV: ${fileName}`
                );
              } catch (error: any) {
                this.logger.error(`Failed to update stock in warehouse-microservice: ${error.message}`, error.stack, 'ImportService');
                // Continue - product was created successfully
              }
            }

            successfulRows++;
          } catch (error: any) {
            failedRows++;
            errors.push({
              row: processedRows + 1,
              code: record.code,
              error: error.message,
            });
            this.logger.error('Failed to import row', {
              row: processedRows + 1,
              code: record.code,
              error: error.message,
            });
          }
          
          processedRows++;
        }

        // Update progress
        await this.prisma.importJob.update({
          where: { id: importJob.id },
          data: {
            processedRows,
            successfulRows,
            failedRows,
            errors,
          },
        });
      }

      // Mark as completed
      await this.prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      this.logger.log('CSV import completed', {
        importJobId: importJob.id,
        totalRows: records.length,
        successfulRows,
        failedRows,
      });

      return {
        id: importJob.id,
        status: 'COMPLETED',
        totalRows: records.length,
        successfulRows,
        failedRows,
      };
    } catch (error: any) {
      // Mark as failed
      await this.prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: error.message,
        },
      });

      this.logger.error('CSV import failed', {
        importJobId: importJob.id,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Calculate stock from warehouse fields
   */
  private calculateStock(row: any): number {
    const primaryWarehouse = this.configService.get<string>('STOCK_PRIMARY_WAREHOUSE') || 'sklad-internet';
    const stockField = `stock:minimumRequiredLevel:${primaryWarehouse}`;
    
    if (row[stockField]) {
      return parseInt(row[stockField]) || 0;
    }

    let totalStock = 0;
    for (const key in row) {
      if (key.startsWith('stock:minimumRequiredLevel:')) {
        totalStock += parseInt(row[key]) || 0;
      }
    }

    return totalStock;
  }

  /**
   * Get import job status
   */
  async getImportJob(id: string): Promise<any> {
    return this.prisma.importJob.findUnique({
      where: { id },
    });
  }

  /**
   * List import jobs
   */
  async listImportJobs(query: any): Promise<{ items: any[]; pagination: any }> {
    const page = Number.parseInt(query.page, 10) || 1;
    const limitRaw = Number.parseInt(query.limit, 10) || 20;
    const limit = Math.min(Math.max(limitRaw, 1), 200); // guard against invalid/huge limits
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.source) {
      where.source = query.source;
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.importJob.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.importJob.count({ where }),
      ]);

      return {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      this.logger.error('Failed to list import jobs', {
        error: error.message,
        page,
        limit,
        skip,
        where,
      });
      throw error;
    }
  }
}

