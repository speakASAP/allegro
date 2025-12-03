/**
 * Products Controller
 * Handles HTTP requests for product operations
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '@allegro/shared';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(@Query() query: any): Promise<{ success: boolean; data: any }> {
    const result = await this.productsService.getProducts(query);
    return { success: true, data: result };
  }

  @Get(':id')
  async getProduct(@Param('id') id: string): Promise<{ success: boolean; data: any }> {
    const product = await this.productsService.getProduct(id);
    return { success: true, data: product };
  }

  @Get('code/:code')
  async getProductByCode(@Param('code') code: string): Promise<{ success: boolean; data: any }> {
    const product = await this.productsService.getProductByCode(code);
    return { success: true, data: product };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createProduct(@Body() dto: any): Promise<{ success: boolean; data: any }> {
    const product = await this.productsService.createProduct(dto);
    return { success: true, data: product };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateProduct(@Param('id') id: string, @Body() dto: any): Promise<{ success: boolean; data: any }> {
    const product = await this.productsService.updateProduct(id, dto);
    return { success: true, data: product };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteProduct(@Param('id') id: string) {
    const result = await this.productsService.deleteProduct(id);
    return { success: true, data: result };
  }

  @Get(':id/stock')
  async getStock(@Param('id') id: string) {
    const stock = await this.productsService.getStock(id);
    return { success: true, data: stock };
  }

  @Put(':id/stock')
  @UseGuards(JwtAuthGuard)
  async updateStock(@Param('id') id: string, @Body() body: { quantity: number }) {
    const stock = await this.productsService.updateStock(id, body.quantity);
    return { success: true, data: stock };
  }

  @Get('export/csv')
  @UseGuards(JwtAuthGuard)
  async exportToCsv(@Res() res: Response) {
    const csv = await this.productsService.exportToCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=products_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  }
}

