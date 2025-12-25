import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, LoggerService } from '@allegro/shared';
import { ProductsService } from './products.service';

@Controller('allegro/products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('ProductsController');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getProducts(@Query() query: any) {
    const startTime = Date.now();
    const requestId = `get-products-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [getProducts] Request received`, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      includeRaw: query.includeRaw,
      timestamp: new Date().toISOString(),
    });

    try {
      const data = await this.productsService.getProducts(query);
      const duration = Date.now() - startTime;
      
      this.logger.log(`[${requestId}] [getProducts] Request completed`, {
        itemsCount: data.items?.length || 0,
        total: data.pagination?.total || 0,
        duration: `${duration}ms`,
      });
      
      return { success: true, data };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${requestId}] [getProducts] Request failed`, {
        error: error.message,
        errorStack: error.stack,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getProduct(@Param('id') id: string) {
    const startTime = Date.now();
    const requestId = `get-product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [getProduct] Request received`, { id });

    try {
      const data = await this.productsService.getProduct(id);
      const duration = Date.now() - startTime;
      
      this.logger.log(`[${requestId}] [getProduct] Request completed`, {
        id,
        allegroProductId: data.allegroProductId,
        name: data.name,
        duration: `${duration}ms`,
      });
      
      return { success: true, data };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${requestId}] [getProduct] Request failed`, {
        id,
        error: error.message,
        errorStack: error.stack,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createProduct(@Body() body: any) {
    const startTime = Date.now();
    const requestId = `create-product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [createProduct] Request received`, {
      allegroProductId: body.allegroProductId,
      hasRawData: !!body.rawData,
      hasParameters: !!body.parameters?.length,
      parametersCount: body.parameters?.length || 0,
      bodyKeys: Object.keys(body),
      timestamp: new Date().toISOString(),
    });

    try {
      const data = await this.productsService.createProduct(body);
      const duration = Date.now() - startTime;
      
      this.logger.log(`[${requestId}] [createProduct] Request completed`, {
        id: data.id,
        allegroProductId: data.allegroProductId,
        name: data.name,
        duration: `${duration}ms`,
      });
      
      return { success: true, data };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${requestId}] [createProduct] Request failed`, {
        error: error.message,
        errorStack: error.stack,
        errorStatus: error.status,
        duration: `${duration}ms`,
        bodyKeys: Object.keys(body),
      });
      throw error;
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateProduct(@Param('id') id: string, @Body() body: any) {
    const startTime = Date.now();
    const requestId = `update-product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [updateProduct] Request received`, {
      id,
      allegroProductId: body.allegroProductId,
      hasRawData: !!body.rawData,
      hasParameters: !!body.parameters,
      bodyKeys: Object.keys(body),
      timestamp: new Date().toISOString(),
    });

    try {
      const data = await this.productsService.updateProduct(id, body);
      const duration = Date.now() - startTime;
      
      this.logger.log(`[${requestId}] [updateProduct] Request completed`, {
        id,
        allegroProductId: data.allegroProductId,
        duration: `${duration}ms`,
      });
      
      return { success: true, data };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${requestId}] [updateProduct] Request failed`, {
        id,
        error: error.message,
        errorStack: error.stack,
        errorStatus: error.status,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteProduct(@Param('id') id: string) {
    const startTime = Date.now();
    const requestId = `delete-product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [deleteProduct] Request received`, { id });

    try {
      await this.productsService.deleteProduct(id);
      const duration = Date.now() - startTime;
      
      this.logger.log(`[${requestId}] [deleteProduct] Request completed`, {
        id,
        duration: `${duration}ms`,
      });
      
      return { success: true };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${requestId}] [deleteProduct] Request failed`, {
        id,
        error: error.message,
        errorStack: error.stack,
        errorStatus: error.status,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  async syncProductsToCatalog(): Promise<{ success: boolean; data: any }> {
    const startTime = Date.now();
    const requestId = `sync-products-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [syncProductsToCatalog] Request received`, {
      timestamp: new Date().toISOString(),
    });

    try {
      const data = await this.productsService.syncAllegroProductsToCatalog();
      const duration = Date.now() - startTime;
      
      this.logger.log(`[${requestId}] [syncProductsToCatalog] Request completed`, {
        total: data.total,
        created: data.created,
        updated: data.updated,
        errors: data.errors,
        duration: `${duration}ms`,
      });
      
      return { success: true, data };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${requestId}] [syncProductsToCatalog] Request failed`, {
        error: error.message,
        errorStack: error.stack,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  @Delete('all')
  @UseGuards(JwtAuthGuard)
  async deleteAllProducts(): Promise<{ success: boolean; data: any }> {
    const startTime = Date.now();
    const requestId = `delete-all-products-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [deleteAllProducts] Request received`, {
      timestamp: new Date().toISOString(),
    });

    try {
      const data = await this.productsService.deleteAllProducts();
      const duration = Date.now() - startTime;
      
      this.logger.log(`[${requestId}] [deleteAllProducts] Request completed`, {
        deleted: data.deleted,
        duration: `${duration}ms`,
      });
      
      return { success: true, data };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${requestId}] [deleteAllProducts] Request failed`, {
        error: error.message,
        errorStack: error.stack,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }
}

