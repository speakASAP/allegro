import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService, LoggerService, CatalogClientService } from '@allegro/shared';

interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
}

interface ProductPayload {
  allegroProductId?: string;
  name?: string;
  brand?: string;
  manufacturerCode?: string;
  ean?: string;
  publicationStatus?: string;
  isAiCoCreated?: boolean;
  marketedBeforeGPSR?: boolean | null;
  rawData?: any;
  parameters?: Array<{
    parameterId: string;
    name?: string;
    values?: any;
    valuesIds?: any;
    rangeValue?: any;
  }>;
}

@Injectable()
export class ProductsService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly catalogClient: CatalogClientService,
  ) {
    this.logger = loggerService;
    this.logger.setContext('ProductsService');
  }

  private extractSummaryFromRaw(
    rawData: any,
    payload: ProductPayload = {},
    existing?: {
      allegroProductId?: string | null;
      name?: string | null;
      brand?: string | null;
      manufacturerCode?: string | null;
      ean?: string | null;
      publicationStatus?: string | null;
      isAiCoCreated?: boolean | null;
      marketedBeforeGPSR?: boolean | null;
      rawData?: any;
    },
  ) {
    const product = rawData?.product || rawData || {};
    const params = Array.isArray(product?.parameters) ? product.parameters : [];
    const findParamValue = (id: string, name?: string): string | undefined => {
      const param = params.find((p: any) => String(p?.id) === id || (name && p?.name === name));
      if (!param) return undefined;
      if (Array.isArray(param.values) && param.values.length > 0) {
        const first = param.values[0] as any;
        if (typeof first === 'string') return first;
        return first?.name;
      }
      if (typeof param.value === 'string') return param.value;
      return undefined;
    };

    return {
      allegroProductId:
        payload.allegroProductId ??
        existing?.allegroProductId ??
        product?.id ??
        rawData?.id ??
        null,
      name: payload.name ?? product?.name ?? existing?.name ?? null,
      brand:
        payload.brand ??
        findParamValue('248811', 'Značka') ??
        product?.brand ??
        existing?.brand ??
        null,
      manufacturerCode:
        payload.manufacturerCode ??
        findParamValue('224017', 'Kód výrobce') ??
        product?.manufacturerCode ??
        existing?.manufacturerCode ??
        null,
      ean:
        payload.ean ??
        findParamValue('225693', 'EAN (GTIN)') ??
        product?.ean ??
        existing?.ean ??
        null,
      publicationStatus:
        payload.publicationStatus ??
        product?.publication?.status ??
        existing?.publicationStatus ??
        null,
      isAiCoCreated:
        payload.isAiCoCreated ?? product?.isAiCoCreated ?? existing?.isAiCoCreated ?? false,
      marketedBeforeGPSR:
        payload.marketedBeforeGPSR ??
        rawData?.marketedBeforeGPSRObligation ??
        existing?.marketedBeforeGPSR ??
        null,
      rawData: payload.rawData ?? rawData ?? existing?.rawData ?? null,
    };
  }

  async getProducts(query: ProductQuery & { includeRaw?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const search = query.search?.trim();
    const includeRaw = query.includeRaw === 'true';

    const startTime = Date.now();
    const requestId = `get-products-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [getProducts] Fetching products from catalog-microservice`, {
      page,
      limit,
      search,
      hasSearch: !!search,
      includeRaw,
      timestamp: new Date().toISOString(),
    });

    try {
      // Fetch products from catalog-microservice
      const catalogResult = await this.catalogClient.searchProducts({
        page,
        limit,
        search,
      });

      // Enrich with AllegroProduct data (Allegro-specific raw data)
      const enrichedItems = await Promise.all(
        catalogResult.items.map(async (catalogProduct: any) => {
          try {
            // Try to find AllegroProduct by EAN or SKU
            const prisma = this.prisma as any;
            const allegroProduct = await prisma.allegroProduct.findFirst({
              where: {
                OR: [
                  catalogProduct.ean ? { ean: catalogProduct.ean } : undefined,
                  { allegroProductId: catalogProduct.sku },
                ].filter(Boolean),
              },
              include: {
                parameters: includeRaw ? {
                  select: {
                    id: true,
                    parameterId: true,
                    name: true,
                    values: true,
                    valuesIds: true,
                    rangeValue: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                } : false,
              },
            });

            return {
              ...catalogProduct,
              // Add Allegro-specific data
              allegroProduct: allegroProduct ? {
                id: allegroProduct.id,
                allegroProductId: allegroProduct.allegroProductId,
                publicationStatus: allegroProduct.publicationStatus,
                isAiCoCreated: allegroProduct.isAiCoCreated,
                marketedBeforeGPSR: allegroProduct.marketedBeforeGPSR,
                rawData: includeRaw ? allegroProduct.rawData : undefined,
                parameters: allegroProduct.parameters || [],
              } : null,
            };
          } catch (error: any) {
            this.logger.warn(`[${requestId}] Failed to enrich product ${catalogProduct.id} with Allegro data: ${error.message}`);
            return {
              ...catalogProduct,
              allegroProduct: null,
            };
          }
        })
      );

      const duration = Date.now() - startTime;
      this.logger.log(`[${requestId}] [getProducts] Products fetched successfully`, {
        page,
        limit,
        total: catalogResult.total,
        itemsCount: enrichedItems.length,
        totalPages: Math.ceil(catalogResult.total / limit),
        duration: `${duration}ms`,
        hasSearch: !!search,
        timestamp: new Date().toISOString(),
      });

      return {
        items: enrichedItems,
        pagination: {
          page: catalogResult.page,
          limit: catalogResult.limit,
          total: catalogResult.total,
          totalPages: Math.ceil(catalogResult.total / limit),
        },
      };
    } catch (error: any) {
      this.logger.error(`[${requestId}] [getProducts] Failed to fetch products: ${error.message}`, error.stack);
      throw new HttpException(`Failed to fetch products: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getProduct(id: string) {
    const startTime = Date.now();
    const requestId = `get-product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [getProduct] Fetching product from catalog-microservice`, { id });

    try {
      // Fetch product from catalog-microservice
      const catalogProduct = await this.catalogClient.getProductById(id);

      if (!catalogProduct) {
        this.logger.warn(`[${requestId}] [getProduct] Product not found in catalog`, {
          id,
        });
        throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
      }

      // Enrich with AllegroProduct data (Allegro-specific raw data)
      const prisma = this.prisma as any;
      const allegroProduct = await prisma.allegroProduct.findFirst({
        where: {
          OR: [
            catalogProduct.ean ? { ean: catalogProduct.ean } : undefined,
            { allegroProductId: catalogProduct.sku },
          ].filter(Boolean),
        },
        include: { parameters: true },
      });

      const duration = Date.now() - startTime;

      this.logger.log(`[${requestId}] [getProduct] Product fetched successfully`, {
        id,
        sku: catalogProduct.sku,
        title: catalogProduct.title,
        hasAllegroData: !!allegroProduct,
        parametersCount: allegroProduct?.parameters?.length || 0,
        duration: `${duration}ms`,
      });

      return {
        ...catalogProduct,
        // Add Allegro-specific data
        allegroProduct: allegroProduct ? {
          id: allegroProduct.id,
          allegroProductId: allegroProduct.allegroProductId,
          publicationStatus: allegroProduct.publicationStatus,
          isAiCoCreated: allegroProduct.isAiCoCreated,
          marketedBeforeGPSR: allegroProduct.marketedBeforeGPSR,
          rawData: allegroProduct.rawData,
          parameters: allegroProduct.parameters || [],
        } : null,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`[${requestId}] [getProduct] Failed to fetch product: ${error.message}`, error.stack);
      throw new HttpException(`Failed to fetch product: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async createProduct(payload: ProductPayload) {
    const startTime = Date.now();
    const requestId = `create-product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [createProduct] Creating product`, {
      hasRawData: !!payload.rawData,
      hasParameters: !!payload.parameters?.length,
      parametersCount: payload.parameters?.length || 0,
      payloadKeys: Object.keys(payload),
      timestamp: new Date().toISOString(),
    });

    if (!payload.rawData) {
      this.logger.error(`[${requestId}] [createProduct] rawData is required`, {
        payloadKeys: Object.keys(payload),
      });
      throw new HttpException('rawData is required', HttpStatus.BAD_REQUEST);
    }

    const prisma = this.prisma as any;
    const summary = this.extractSummaryFromRaw(payload.rawData, payload);

    // Ensure allegroProductId is set (required field)
    const allegroProductId = 
      payload.allegroProductId || 
      summary.allegroProductId || 
      payload.rawData?.product?.id || 
      payload.rawData?.id || 
      `local-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Generate SKU from allegroProductId if EAN is not available
    const sku = summary.ean || `ALLEGRO-${allegroProductId}`;

    this.logger.log(`[${requestId}] [createProduct] Creating product in catalog-microservice`, {
      allegroProductId,
      sku,
      name: summary.name,
      brand: summary.brand,
      ean: summary.ean,
      isGeneratedId: allegroProductId.startsWith('local-'),
    });

    try {
      // First, create or update product in catalog-microservice
      let catalogProduct;
      try {
        // Try to find existing product by SKU
        let existing = await this.catalogClient.getProductBySku(sku);
        
        // If not found by SKU and EAN exists, try searching by EAN
        if (!existing && summary.ean) {
          const searchResults = await this.catalogClient.searchProducts({ search: summary.ean });
          existing = searchResults.items.find((p: any) => p.ean === summary.ean);
        }

        if (existing) {
          // Update existing product
          catalogProduct = await this.catalogClient.updateProduct(existing.id, {
            title: summary.name || existing.title,
            brand: summary.brand || existing.brand,
            manufacturer: summary.manufacturerCode || existing.manufacturer,
            ean: summary.ean || existing.ean,
          });
          this.logger.log(`[${requestId}] [createProduct] Updated existing product in catalog`, {
            catalogProductId: catalogProduct.id,
          });
        } else {
          // Create new product
          catalogProduct = await this.catalogClient.createProduct({
            sku,
            title: summary.name || 'Product',
            brand: summary.brand,
            manufacturer: summary.manufacturerCode,
            ean: summary.ean,
          });
          this.logger.log(`[${requestId}] [createProduct] Created new product in catalog`, {
            catalogProductId: catalogProduct.id,
          });
        }
      } catch (error: any) {
        this.logger.error(`[${requestId}] [createProduct] Failed to create/update product in catalog-microservice: ${error.message}`, error.stack);
        throw new HttpException(`Failed to create product in catalog: ${error.message}`, HttpStatus.BAD_REQUEST);
      }

      // Then, create AllegroProduct for Allegro-specific raw data
      const dbStartTime = Date.now();
      const created = await prisma.allegroProduct.create({
        data: {
          allegroProductId: String(allegroProductId),
          name: summary.name,
          brand: summary.brand,
          manufacturerCode: summary.manufacturerCode,
          ean: summary.ean,
          publicationStatus: summary.publicationStatus,
          isAiCoCreated: summary.isAiCoCreated,
          marketedBeforeGPSR: summary.marketedBeforeGPSR,
          rawData: summary.rawData,
        } as any,
        include: { parameters: true },
      });
      const dbDuration = Date.now() - dbStartTime;

      this.logger.log(`[${requestId}] [createProduct] AllegroProduct created in database`, {
        id: created.id,
        allegroProductId: created.allegroProductId,
        catalogProductId: catalogProduct.id,
        dbDuration: `${dbDuration}ms`,
      });

      if (payload.parameters?.length) {
        this.logger.log(`[${requestId}] [createProduct] Replacing parameters from payload`, {
          productId: created.id,
          parametersCount: payload.parameters.length,
        });
        await this.replaceParameters(created.id, payload.parameters);
      } else if (Array.isArray(payload.rawData?.product?.parameters)) {
        this.logger.log(`[${requestId}] [createProduct] Replacing parameters from rawData`, {
          productId: created.id,
          parametersCount: payload.rawData.product.parameters.length,
        });
        await this.replaceParameters(created.id, payload.rawData.product.parameters);
      }

      const totalDuration = Date.now() - startTime;
      this.logger.log(`[${requestId}] [createProduct] Product creation completed`, {
        catalogProductId: catalogProduct.id,
        allegroProductId: created.allegroProductId,
        totalDuration: `${totalDuration}ms`,
      });

      // Return enriched product
      return this.getProduct(catalogProduct.id);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`[${requestId}] [createProduct] Failed to create product: ${error.message}`, error.stack);
      throw new HttpException(`Failed to create product: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async updateProduct(id: string, payload: ProductPayload) {
    const startTime = Date.now();
    const requestId = `update-product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [updateProduct] Updating product`, {
      id,
      payloadKeys: Object.keys(payload),
      hasRawData: !!payload.rawData,
      hasParameters: !!payload.parameters,
      timestamp: new Date().toISOString(),
    });

    try {
      // First, get existing product from catalog-microservice
      let catalogProduct;
      try {
        catalogProduct = await this.catalogClient.getProductById(id);
      } catch (error: any) {
        this.logger.warn(`[${requestId}] [updateProduct] Product not found in catalog, trying to find by AllegroProduct`, { id });
        // If not found in catalog, try to find by AllegroProduct
        const prisma = this.prisma as any;
        const allegroProduct = await prisma.allegroProduct.findUnique({ where: { id } });
        if (!allegroProduct) {
          throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
        }
        // Try to find catalog product by EAN or SKU
        const sku = allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`;
        catalogProduct = await this.catalogClient.getProductBySku(sku);
        if (!catalogProduct) {
          throw new HttpException('Product not found in catalog', HttpStatus.NOT_FOUND);
        }
        id = catalogProduct.id; // Use catalog product ID
      }

      const prisma = this.prisma as any;
      const existingAllegroProduct = await prisma.allegroProduct.findFirst({
        where: {
          OR: [
            catalogProduct.ean ? { ean: catalogProduct.ean } : undefined,
            { allegroProductId: catalogProduct.sku },
          ].filter(Boolean),
        },
      });

      if (!existingAllegroProduct) {
        this.logger.warn(`[${requestId}] [updateProduct] AllegroProduct not found`, { id });
      }

      this.logger.log(`[${requestId}] [updateProduct] Product found, extracting summary`, {
        catalogProductId: catalogProduct.id,
        allegroProductId: existingAllegroProduct?.allegroProductId,
        existingName: catalogProduct.title,
      });

      const rawData = payload.rawData ?? existingAllegroProduct?.rawData;
      const summary = this.extractSummaryFromRaw(rawData, payload, existingAllegroProduct || undefined);

      // Update product in catalog-microservice
      try {
        catalogProduct = await this.catalogClient.updateProduct(id, {
          title: summary.name ?? catalogProduct.title,
          brand: summary.brand ?? catalogProduct.brand,
          manufacturer: summary.manufacturerCode ?? catalogProduct.manufacturer,
          ean: summary.ean ?? catalogProduct.ean,
        });
        this.logger.log(`[${requestId}] [updateProduct] Product updated in catalog-microservice`, {
          catalogProductId: catalogProduct.id,
        });
      } catch (error: any) {
        this.logger.error(`[${requestId}] [updateProduct] Failed to update product in catalog: ${error.message}`, error.stack);
        throw new HttpException(`Failed to update product in catalog: ${error.message}`, HttpStatus.BAD_REQUEST);
      }

      // Update AllegroProduct if it exists
      if (existingAllegroProduct) {
        const dbStartTime = Date.now();
        await prisma.allegroProduct.update({
          where: { id: existingAllegroProduct.id },
          data: {
            allegroProductId: summary.allegroProductId ?? existingAllegroProduct.allegroProductId,
            name: summary.name ?? existingAllegroProduct.name,
            brand: summary.brand ?? existingAllegroProduct.brand,
            manufacturerCode: summary.manufacturerCode ?? existingAllegroProduct.manufacturerCode,
            ean: summary.ean ?? existingAllegroProduct.ean,
            publicationStatus: summary.publicationStatus ?? existingAllegroProduct.publicationStatus,
            isAiCoCreated: summary.isAiCoCreated ?? existingAllegroProduct.isAiCoCreated,
            marketedBeforeGPSR: summary.marketedBeforeGPSR ?? existingAllegroProduct.marketedBeforeGPSR,
            rawData: summary.rawData ?? existingAllegroProduct.rawData,
          } as any,
        });
        const dbDuration = Date.now() - dbStartTime;

        this.logger.log(`[${requestId}] [updateProduct] AllegroProduct updated in database`, {
          allegroProductId: existingAllegroProduct.allegroProductId,
          dbDuration: `${dbDuration}ms`,
        });

        if (payload.parameters) {
          this.logger.log(`[${requestId}] [updateProduct] Replacing parameters`, {
            productId: existingAllegroProduct.id,
            parametersCount: payload.parameters.length,
          });
          await this.replaceParameters(existingAllegroProduct.id, payload.parameters);
        }
      }

      const totalDuration = Date.now() - startTime;
      this.logger.log(`[${requestId}] [updateProduct] Product update completed`, {
        catalogProductId: catalogProduct.id,
        totalDuration: `${totalDuration}ms`,
      });

      return this.getProduct(id);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`[${requestId}] [updateProduct] Failed to update product: ${error.message}`, error.stack);
      throw new HttpException(`Failed to update product: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteProduct(id: string) {
    const startTime = Date.now();
    const requestId = `delete-product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [deleteProduct] Deleting product`, { id });

    try {
      // Get product from catalog-microservice to find related AllegroProduct
      let catalogProduct;
      try {
        catalogProduct = await this.catalogClient.getProductById(id);
      } catch (error: any) {
        // If not found in catalog, try to find by AllegroProduct
        const prisma = this.prisma as any;
        const allegroProduct = await prisma.allegroProduct.findUnique({
          where: { id },
          select: { id: true, allegroProductId: true, name: true, ean: true },
        });

        if (!allegroProduct) {
          this.logger.warn(`[${requestId}] [deleteProduct] Product not found`, { id });
          throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
        }

        // Delete AllegroProduct only (catalog product might not exist)
        await prisma.allegroProduct.delete({ where: { id } });
        
        const duration = Date.now() - startTime;
        this.logger.log(`[${requestId}] [deleteProduct] AllegroProduct deleted successfully`, {
          id,
          allegroProductId: allegroProduct.allegroProductId,
          duration: `${duration}ms`,
        });

        return { success: true };
      }

      // Find and delete related AllegroProduct
      const prisma = this.prisma as any;
      const allegroProduct = await prisma.allegroProduct.findFirst({
        where: {
          OR: [
            catalogProduct.ean ? { ean: catalogProduct.ean } : undefined,
            { allegroProductId: catalogProduct.sku },
          ].filter(Boolean),
        },
        select: { id: true, allegroProductId: true },
      });

      if (allegroProduct) {
        await prisma.allegroProduct.delete({ where: { id: allegroProduct.id } });
        this.logger.log(`[${requestId}] [deleteProduct] AllegroProduct deleted`, {
          allegroProductId: allegroProduct.allegroProductId,
        });
      }

      // Note: We don't delete from catalog-microservice here
      // The catalog product should be deactivated/deleted separately if needed
      // This service only manages Allegro-specific data
      
      const duration = Date.now() - startTime;
      this.logger.log(`[${requestId}] [deleteProduct] Product deleted successfully`, {
        catalogProductId: catalogProduct.id,
        duration: `${duration}ms`,
      });

      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`[${requestId}] [deleteProduct] Failed to delete product: ${error.message}`, error.stack);
      throw new HttpException(`Failed to delete product: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Sync all AllegroProducts to catalog-microservice
   * Creates catalog products for AllegroProducts that don't have corresponding catalog products
   */
  async syncAllegroProductsToCatalog(): Promise<{ total: number; created: number; updated: number; errors: number }> {
    const startTime = Date.now();
    const requestId = `sync-products-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[${requestId}] [syncAllegroProductsToCatalog] Starting sync`, {
      timestamp: new Date().toISOString(),
    });

    const prisma = this.prisma as any;
    let created = 0;
    let updated = 0;
    let errors = 0;

    try {
      // Get all AllegroProducts
      const allegroProducts = await prisma.allegroProduct.findMany({
        where: {
          OR: [
            { ean: { not: null } },
            { allegroProductId: { not: null } },
          ],
        },
      });

      this.logger.log(`[${requestId}] [syncAllegroProductsToCatalog] Found ${allegroProducts.length} AllegroProducts to sync`);

      for (const allegroProduct of allegroProducts) {
        try {
          const sku = allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`;
          
          // Try to find existing catalog product
          let catalogProduct;
          try {
            catalogProduct = await this.catalogClient.getProductBySku(sku);
          } catch {
            // Not found by SKU, try by EAN if available
            if (allegroProduct.ean) {
              const searchResults = await this.catalogClient.searchProducts({ search: allegroProduct.ean });
              catalogProduct = searchResults.items?.find((p: any) => p.ean === allegroProduct.ean);
            }
          }
          
          if (catalogProduct) {
            // Update existing product
            await this.catalogClient.updateProduct(catalogProduct.id, {
              title: allegroProduct.name || catalogProduct.title,
              brand: allegroProduct.brand || catalogProduct.brand,
              manufacturer: allegroProduct.manufacturerCode || catalogProduct.manufacturer,
              ean: allegroProduct.ean || catalogProduct.ean,
            });
            updated++;
            this.logger.log(`[${requestId}] [syncAllegroProductsToCatalog] Updated catalog product`, {
              catalogProductId: catalogProduct.id,
              sku,
            });
          } else {
            // Create new catalog product
            catalogProduct = await this.catalogClient.createProduct({
              sku,
              title: allegroProduct.name || 'Product',
              brand: allegroProduct.brand,
              manufacturer: allegroProduct.manufacturerCode,
              ean: allegroProduct.ean,
            });
            created++;
            this.logger.log(`[${requestId}] [syncAllegroProductsToCatalog] Created catalog product`, {
              catalogProductId: catalogProduct.id,
              sku,
            });
          }
        } catch (error: any) {
          errors++;
          this.logger.error(`[${requestId}] [syncAllegroProductsToCatalog] Failed to sync AllegroProduct ${allegroProduct.id}: ${error.message}`, error.stack);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(`[${requestId}] [syncAllegroProductsToCatalog] Sync completed`, {
        total: allegroProducts.length,
        created,
        updated,
        errors,
        duration: `${duration}ms`,
      });

      return {
        total: allegroProducts.length,
        created,
        updated,
        errors,
      };
    } catch (error: any) {
      this.logger.error(`[${requestId}] [syncAllegroProductsToCatalog] Sync failed: ${error.message}`, error.stack);
      throw new HttpException(`Failed to sync products: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async replaceParameters(productId: string, parameters: any[]) {
    const startTime = Date.now();
    this.logger.log('[replaceParameters] Replacing product parameters', {
      productId,
      parametersCount: parameters.length,
    });

    const prisma = this.prisma as any;
    
    const deleteStartTime = Date.now();
    await prisma.allegroProductParameter.deleteMany({ where: { allegroProductId: productId } });
    const deleteDuration = Date.now() - deleteStartTime;
    
    this.logger.log('[replaceParameters] Existing parameters deleted', {
      productId,
      deleteDuration: `${deleteDuration}ms`,
    });

    if (parameters.length === 0) {
      this.logger.log('[replaceParameters] No parameters to add', { productId });
      return;
    }
    
    const data = parameters.map((param: any, index: number) => ({
      allegroProductId: productId,
      parameterId: param.parameterId || param.id || `param-${index}`,
      name: param.name || null,
      values: param.values || null,
      valuesIds: param.valuesIds || null,
      rangeValue: param.rangeValue || null,
    }));
    
    const createStartTime = Date.now();
    await prisma.allegroProductParameter.createMany({
      data: data as any,
      skipDuplicates: true,
    });
    const createDuration = Date.now() - createStartTime;
    
    const totalDuration = Date.now() - startTime;
    this.logger.log('[replaceParameters] Parameters replaced successfully', {
      productId,
      parametersCount: parameters.length,
      createDuration: `${createDuration}ms`,
      totalDuration: `${totalDuration}ms`,
    });
  }
}

