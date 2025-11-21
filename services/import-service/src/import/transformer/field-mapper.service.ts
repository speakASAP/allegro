/**
 * Field Mapper Service
 * Maps BizBox fields to Allegro fields
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '@allegro/shared';

@Injectable()
export class FieldMapperService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Map BizBox field to Allegro field
   */
  mapField(bizboxField: string): string {
    const mapping: Record<string, string> = {
      'name:cs': 'title',
      'description:cs': 'description',
      'purchasePriceGrossPrice': 'price',
      'ean': 'ean',
      'manufacturerCode': 'manufacturerCode',
      'bigImages': 'images',
      'galleryImages': 'images',
    };

    return mapping[bizboxField] || bizboxField;
  }

  /**
   * Get all field mappings
   */
  getFieldMappings(): Record<string, string> {
    return {
      // Basic info
      'code': 'productCode',
      'name:cs': 'title',
      'nameUrl:cs': 'urlSlug',
      'description:cs': 'description',
      'shortDescription:cs': 'shortDescription',
      
      // Pricing
      'purchasePrice': 'purchasePrice',
      'purchasePriceTaxRate': 'purchasePriceTaxRate',
      'purchasePriceGrossPrice': 'price',
      'purchasePriceCurrency': 'currency',
      
      // Product identifiers
      'ean': 'ean',
      'manufacturerCode': 'manufacturerCode',
      'externalId': 'externalId',
      
      // Physical attributes
      'weight': 'weight',
      'netWeight': 'netWeight',
      'height': 'height',
      'width': 'width',
      'depth': 'depth',
      'length': 'length',
      'material': 'material',
      'origin': 'origin',
      
      // Images
      'bigImages': 'images',
      'smallImages': 'images',
      'galleryImages': 'images',
      
      // Stock
      'stock:minimumRequiredLevel:sklad-internet': 'stockQuantity',
      'stock:minimumRequiredLevel:Obchod-Ledec': 'stockQuantity',
      'stock:minimumRequiredLevel:Sklad-Vilemovice': 'stockQuantity',
      'stock:minimumRequiredLevel:pocenice': 'stockQuantity',
      'stock:minimumRequiredLevel:vlci-doly': 'stockQuantity',
      
      // Categories
      'categoriesSingle': 'categoryId',
      'defaultCategory': 'categoryId',
      
      // SEO
      'seoTitle:cs': 'seoTitle',
      'seoDescription:cs': 'seoDescription',
      'seoKeywords:cs': 'seoKeywords',
    };
  }

  /**
   * Map BizBox record to Allegro format
   */
  mapRecord(bizboxRecord: any): Record<string, any> {
    const mappings = this.getFieldMappings();
    const allegroRecord: Record<string, any> = {};

    for (const [bizboxField, allegroField] of Object.entries(mappings)) {
      if (bizboxRecord[bizboxField] !== undefined && bizboxRecord[bizboxField] !== null) {
        allegroRecord[allegroField] = bizboxRecord[bizboxField];
      }
    }

    return allegroRecord;
  }
}

