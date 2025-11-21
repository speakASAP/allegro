/**
 * Categories Service
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '@allegro/shared';
import { AllegroApiService } from '../allegro-api.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
  ) {}

  /**
   * Get categories from Allegro
   */
  async getCategories(parentId?: string) {
    this.logger.log('Fetching categories from Allegro', { parentId });
    
    try {
      const categories = await this.allegroApi.getCategories(parentId);
      return categories;
    } catch (error: any) {
      this.logger.error('Failed to fetch categories', {
        parentId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get category by ID
   */
  async getCategory(categoryId: string) {
    this.logger.log('Fetching category from Allegro', { categoryId });
    
    try {
      const category = await this.allegroApi.getCategory(categoryId);
      return category;
    } catch (error: any) {
      this.logger.error('Failed to fetch category', {
        categoryId,
        error: error.message,
      });
      throw error;
    }
  }
}

