/**
 * Categories Controller
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '@allegro/shared';

@Controller('allegro/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getCategories(@Query() query: any) {
    const result = await this.categoriesService.getCategories(query.parentId);
    return { success: true, data: result };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getCategory(@Param('id') id: string) {
    const category = await this.categoriesService.getCategory(id);
    return { success: true, data: category };
  }
}

