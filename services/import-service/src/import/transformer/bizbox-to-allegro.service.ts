/**
 * BizBox to Allegro Transformer Service
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@allegro/shared';

@Injectable()
export class BizboxToAllegroService {
  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Transform BizBox CSV row to Allegro format
   */
  transform(row: any): any {
    try {
      // Extract images from JSON fields
      const images = this.extractImages(row);
      
      // Calculate price (with margin if configured)
      const marginPercent = parseFloat(this.configService.get<string>('PRICE_MARGIN_PERCENT') || '20');
      const purchasePrice = parseFloat(row.purchasePriceGrossPrice || row.purchasePrice || '0');
      const sellingPrice = purchasePrice * (1 + marginPercent / 100);

      // Calculate stock (sum from all warehouses or use primary)
      const stock = this.calculateStock(row);

      // Transform to Allegro format
      const allegroData = {
        name: row['name:cs'] || row.name || '',
        description: this.cleanHtml(row['description:cs'] || row.description || ''),
        category: {
          id: this.mapCategory(row.categoriesSingle || row.defaultCategory || ''),
        },
        images: images,
        sellingMode: {
          format: 'BUY_NOW',
          price: {
            amount: sellingPrice.toFixed(2),
            currency: this.configService.get<string>('PRICE_CURRENCY_TARGET') || 'PLN',
          },
        },
        stock: {
          available: stock,
        },
        publication: {
          duration: 'P30D', // 30 days
        },
        parameters: this.extractParameters(row),
        ean: row.ean || '',
        allegroLocallyFundedRefund: false,
        location: {
          city: 'Prague',
          province: 'CZ',
          countryCode: 'CZ',
        },
      };

      return allegroData;
    } catch (error: any) {
      this.logger.error('Failed to transform BizBox row to Allegro format', {
        error: error.message,
        row: row.code,
      });
      throw error;
    }
  }

  /**
   * Extract images from JSON fields
   */
  private extractImages(row: any): string[] {
    const images: string[] = [];

    // Try to parse bigImages
    if (row.bigImages) {
      try {
        const parsed = typeof row.bigImages === 'string' ? JSON.parse(row.bigImages) : row.bigImages;
        if (Array.isArray(parsed)) {
          images.push(...parsed);
        }
      } catch (e) {
        // Not JSON, might be comma-separated
        images.push(...row.bigImages.split(',').map((img: string) => img.trim()));
      }
    }

    // Try galleryImages
    if (row.galleryImages) {
      try {
        const parsed = typeof row.galleryImages === 'string' ? JSON.parse(row.galleryImages) : row.galleryImages;
        if (Array.isArray(parsed)) {
          images.push(...parsed);
        }
      } catch (e) {
        images.push(...row.galleryImages.split(',').map((img: string) => img.trim()));
      }
    }

    return images.filter(img => img && img.length > 0);
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

    // Sum all warehouse stocks
    let totalStock = 0;
    for (const key in row) {
      if (key.startsWith('stock:minimumRequiredLevel:')) {
        totalStock += parseInt(row[key]) || 0;
      }
    }

    return totalStock;
  }

  /**
   * Extract parameters from custom fields
   */
  private extractParameters(row: any): any[] {
    const parameters: any[] = [];

    // Add EAN if available
    if (row.ean) {
      parameters.push({
        id: '11323', // EAN parameter ID (example)
        values: [row.ean],
      });
    }

    // Add manufacturer code if available
    if (row.manufacturerCode) {
      parameters.push({
        id: '11324', // Manufacturer code parameter ID (example)
        values: [row.manufacturerCode],
      });
    }

    return parameters;
  }

  /**
   * Clean HTML from description
   */
  private cleanHtml(html: string): string {
    if (!html) return '';
    // Remove HTML tags (simplified)
    return html.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Map BizBox category to Allegro category ID
   * This is a placeholder - should be implemented with actual category mapping
   */
  private mapCategory(bizboxCategory: string): string {
    // Placeholder - should query Allegro categories API or use mapping table
    return '';
  }
}

