/**
 * Products Service
 * Handles product catalog operations
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Get products with pagination and filtering
   */
  async getProducts(filters: any): Promise<{ items: any[]; pagination: any }> {
    const page = parseInt(String(filters.page || 1), 10);
    const limit = parseInt(String(filters.limit || 20), 10);
    const skip = (page - 1) * limit;

    const where: any = {
      active: true,
    };

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.brand) {
      where.brand = filters.brand;
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: filters.sortBy
          ? { [filters.sortBy]: filters.sortOrder || 'asc' }
          : { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
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
  }

  /**
   * Get product by ID
   */
  async getProduct(id: string): Promise<any> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        allegroOffers: true,
        supplierProducts: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Get product by code
   */
  async getProductByCode(code: string): Promise<any> {
    const product = await this.prisma.product.findUnique({
      where: { code },
      include: {
        allegroOffers: true,
        supplierProducts: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with code ${code} not found`);
    }

    return product;
  }

  /**
   * Create product
   */
  async createProduct(dto: any): Promise<any> {
    this.logger.log('Creating product', { code: dto.code });
    
    const product = await this.prisma.product.create({
      data: dto,
    });

    return product;
  }

  /**
   * Update product
   */
  async updateProduct(id: string, dto: any): Promise<any> {
    this.logger.log('Updating product', { id });

    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
    });

    return product;
  }

  /**
   * Delete product
   */
  async deleteProduct(id: string) {
    this.logger.log('Deleting product', { id });

    await this.prisma.product.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Get stock level
   */
  async getStock(id: string) {
    const product = await this.getProduct(id);
    return {
      productId: id,
      stockQuantity: product.stockQuantity,
      trackInventory: product.trackInventory,
    };
  }

  /**
   * Update stock level
   */
  async updateStock(id: string, quantity: number) {
    this.logger.log('Updating stock', { id, quantity });

    const product = await this.prisma.product.update({
      where: { id },
      data: { stockQuantity: quantity },
    });

    return {
      productId: id,
      stockQuantity: product.stockQuantity,
    };
  }

  /**
   * Export products to CSV
   */
  async exportToCsv(): Promise<string> {
    this.logger.log('Exporting products to CSV');

    const products = await this.prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // CSV header
    const headers = [
      'Code',
      'Name',
      'Stock Quantity',
      'Selling Price',
      'Purchase Price',
      'EAN',
      'Brand',
      'Manufacturer',
      'Active',
      'Created At',
    ];

    // CSV rows
    const rows = products.map((product) => [
      product.code || '',
      product.name || '',
      String(product.stockQuantity || 0),
      product.sellingPrice ? String(product.sellingPrice) : '',
      product.purchasePrice ? String(product.purchasePrice) : '',
      product.ean || '',
      product.brand || '',
      product.manufacturer || '',
      product.active ? 'Yes' : 'No',
      product.createdAt.toISOString(),
    ]);

    // Combine header and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}

