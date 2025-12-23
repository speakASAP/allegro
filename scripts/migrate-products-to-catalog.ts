/**
 * Migration Script: Migrate all products from allegro-service to catalog-microservice
 *
 * This script migrates products from:
 * 1. Product table (deprecated) -> catalog-microservice
 * 2. AllegroProduct table -> catalog-microservice (if not already migrated)
 *
 * Usage:
 *   npm run migrate:products
 *   or
 *   ts-node scripts/migrate-products-to-catalog.ts
 *
 * The script is idempotent - it can be run multiple times safely.
 * It checks if products already exist in catalog-microservice before creating.
 */

import { PrismaClient } from '../shared/node_modules/.prisma/client';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

interface MigrationStats {
  totalProducts: number;
  totalAllegroProducts: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ productId: string; sku: string; error: string }>;
}

interface NormalizedRecord {
  source: 'allegro-product' | 'allegro-raw';
  legacyId: string;
  sku: string | null;
  ean: string | null;
  name: string | null;
  stockQuantity: number;
  price: number | null;
  currency: string | null;
  updatedAt?: string | null;
  needsManualReview: boolean;
  notes: string[];
  catalogPayload: any;
}

class ProductMigrationService {
  private prisma: PrismaClient;
  private catalogClient: AxiosInstance;
  private loggingClient: AxiosInstance;
  private stats: MigrationStats;
  private dryRun: boolean;
  private exportOnly: boolean;
  private exportPath: string;

  constructor(dryRun: boolean = false, exportOnly: boolean = false, exportPath?: string) {
    this.dryRun = dryRun;
    this.exportOnly = exportOnly;
    this.exportPath = exportPath || path.resolve(process.cwd(), 'tmp/migration/allegro-products-normalized.json');

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    const catalogUrl = process.env.CATALOG_SERVICE_URL || 'http://catalog-microservice:3200';
    this.catalogClient = axios.create({
      baseURL: catalogUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const loggingUrl = process.env.LOGGING_SERVICE_URL || 'http://logging-microservice:3367';
    this.loggingClient = axios.create({
      baseURL: loggingUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.stats = {
      totalProducts: 0,
      totalAllegroProducts: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [],
    };
  }

  /**
   * Centralized logging (console + logging microservice)
   */
  private async log(level: 'info' | 'warn' | 'error' | 'debug', message: string, metadata: Record<string, any> = {}) {
    const payload = {
      level,
      message,
      service: 'allegro-migration',
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        pid: process.pid,
      },
    };

    try {
      await this.loggingClient.post('/api/logs', payload);
    } catch {
      // ignore logging errors to keep migration flowing
    }

    const prefix = `[${new Date().toISOString()}][${level.toUpperCase()}]`;
    // eslint-disable-next-line no-console
    console.log(prefix, message, Object.keys(metadata).length ? metadata : '');
  }

  private normalizeSku(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeEan(value?: string | null): string | null {
    if (!value) return null;
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length < 8 || digitsOnly.length > 14) {
      return null;
    }
    return digitsOnly;
  }

  /**
   * Check if product exists in catalog-microservice by SKU or EAN
   */
  private async findProductInCatalog(sku: string, ean?: string | null): Promise<any | null> {
    try {
      // Try by SKU first
      const skuResponse = await this.catalogClient.get(`/api/products/sku/${sku}`);
      if (skuResponse.data?.success && skuResponse.data?.data) {
        return skuResponse.data.data;
      }
    } catch (error: any) {
      // Product not found by SKU, continue
    }

    // Try by EAN if provided
    if (ean) {
      try {
        const searchResponse = await this.catalogClient.get(`/api/products?search=${ean}&limit=100`);
        const items = searchResponse.data?.data || [];
        const found = items.find((p: any) => p.ean === ean);
        if (found) {
          return found;
        }
      } catch (error: any) {
        // Product not found by EAN, continue
      }
    }

    return null;
  }

  /**
   * Map Product table data to catalog-microservice format
   */
  private mapProductToCatalog(product: any): any {
    const catalogProduct: any = {
      sku: product.code || `ALLEGRO-${product.id}`,
      title: product.name || 'Product',
      description: product.description || product.shortDescription || null,
      brand: product.brand || null,
      manufacturer: product.manufacturer || null,
      ean: product.ean || null,
      isActive: product.active !== false,
    };

    // Map weight
    if (product.weight) {
      catalogProduct.weightKg = Number(product.weight);
    }

    // Map dimensions
    if (product.height || product.width || product.depth || product.length) {
      catalogProduct.dimensionsCm = {
        height: product.height ? Number(product.height) : undefined,
        width: product.width ? Number(product.width) : undefined,
        depth: product.depth ? Number(product.depth) : undefined,
        length: product.length ? Number(product.length) : undefined,
      };
    }

    // Map SEO data
    if (product.seoTitle || product.seoDescription || product.seoKeywords) {
      catalogProduct.seoData = {
        metaTitle: product.seoTitle || null,
        metaDescription: product.seoDescription || null,
        keywords: product.seoKeywords ? (typeof product.seoKeywords === 'string' ? product.seoKeywords.split(',') : product.seoKeywords) : [],
      };
    }

    // Map tags
    if (product.tags) {
      if (Array.isArray(product.tags)) {
        catalogProduct.tags = product.tags;
      } else if (typeof product.tags === 'string') {
        catalogProduct.tags = product.tags.split(',').map((t: string) => t.trim());
      }
    }

    return catalogProduct;
  }

  /**
   * Map AllegroProduct data to catalog-microservice format
   */
  private mapAllegroProductToCatalog(allegroProduct: any): any {
    const catalogProduct: any = {
      sku: allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`,
      title: allegroProduct.name || 'Product',
      brand: allegroProduct.brand || null,
      manufacturer: allegroProduct.manufacturerCode || null,
      ean: allegroProduct.ean || null,
      isActive: true,
    };

    return catalogProduct;
  }

  /**
   * Create or update product in catalog-microservice
   */
  private async createOrUpdateProduct(productData: any, existingProduct?: any): Promise<any> {
    if (this.dryRun) {
      // In dry-run mode, just return mock data
      return {
        id: existingProduct?.id || 'mock-id-' + Date.now(),
        ...productData,
      };
    }

    try {
      if (existingProduct) {
        // Update existing product
        const response = await this.catalogClient.put(`/api/products/${existingProduct.id}`, productData);
        return response.data?.data;
      } else {
        // Create new product
        const response = await this.catalogClient.post('/api/products', productData);
        return response.data?.data;
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      throw new Error(errorMessage);
    }
  }

  /**
   * Migrate a single product from Product table
   */
  private async migrateProduct(product: any): Promise<void> {
    const sku = product.code || `ALLEGRO-${product.id}`;
    
    try {
      // Check if product already exists in catalog
      const existing = await this.findProductInCatalog(sku, product.ean);

      // Map product data
      const catalogData = this.mapProductToCatalog(product);

      // Create or update
      await this.createOrUpdateProduct(catalogData, existing);

      if (existing) {
        this.stats.updated++;
        const action = this.dryRun ? 'Would update' : 'Updated';
        console.log(`✅ ${action} product: ${sku} (${product.name})`);
      } else {
        this.stats.created++;
        const action = this.dryRun ? 'Would create' : 'Created';
        console.log(`✅ ${action} product: ${sku} (${product.name})`);
      }
    } catch (error: any) {
      this.stats.errors++;
      this.stats.errorDetails.push({
        productId: product.id,
        sku,
        error: error.message,
      });
      console.error(`❌ Error migrating product ${sku}: ${error.message}`);
    }
  }

  /**
   * Migrate a single AllegroProduct
   */
  private async migrateAllegroProduct(allegroProduct: any): Promise<void> {
    const sku = allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`;
    
    try {
      // Check if product already exists in catalog
      const existing = await this.findProductInCatalog(sku, allegroProduct.ean);

      // Map product data
      const catalogData = this.mapAllegroProductToCatalog(allegroProduct);

      // Create or update
      await this.createOrUpdateProduct(catalogData, existing);

      if (existing) {
        this.stats.updated++;
        const action = this.dryRun ? 'Would update' : 'Updated';
        console.log(`✅ ${action} AllegroProduct: ${sku} (${allegroProduct.name || allegroProduct.allegroProductId})`);
      } else {
        this.stats.created++;
        const action = this.dryRun ? 'Would create' : 'Created';
        console.log(`✅ ${action} AllegroProduct: ${sku} (${allegroProduct.name || allegroProduct.allegroProductId})`);
      }
    } catch (error: any) {
      this.stats.errors++;
      this.stats.errorDetails.push({
        productId: allegroProduct.id,
        sku,
        error: error.message,
      });
      console.error(`❌ Error migrating AllegroProduct ${sku}: ${error.message}`);
    }
  }

  /**
   * Migrate all products from Product table
   */
  private async migrateProductsTable(): Promise<void> {
    console.log('\n📦 Migrating products from Product table...\n');

    const products = await this.prisma.product.findMany({
      orderBy: { createdAt: 'asc' },
    });

    this.stats.totalProducts = products.length;
    console.log(`Found ${products.length} products to migrate\n`);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`[${i + 1}/${products.length}] Processing product: ${product.code || product.id}`);
      await this.migrateProduct(product);
      
      // Small delay to avoid overwhelming the API
      if (i < products.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Migrate all products from AllegroProduct table
   */
  private async migrateAllegroProductsTable(): Promise<void> {
    console.log('\n📦 Migrating products from AllegroProduct table...\n');

    const allegroProducts = await this.prisma.allegroProduct.findMany({
      orderBy: { createdAt: 'asc' },
    });

    this.stats.totalAllegroProducts = allegroProducts.length;
    console.log(`Found ${allegroProducts.length} AllegroProducts to migrate\n`);

    for (let i = 0; i < allegroProducts.length; i++) {
      const allegroProduct = allegroProducts[i];
      console.log(`[${i + 1}/${allegroProducts.length}] Processing AllegroProduct: ${allegroProduct.allegroProductId}`);
      
      // Skip if already migrated (check by EAN or SKU)
      const sku = allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`;
      const existing = await this.findProductInCatalog(sku, allegroProduct.ean);
      
      if (existing) {
        this.stats.skipped++;
        console.log(`⏭️  Skipped (already exists): ${sku}`);
        continue;
      }

      await this.migrateAllegroProduct(allegroProduct);
      
      // Small delay to avoid overwhelming the API
      if (i < allegroProducts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Print migration statistics
   */
  private printStats(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Statistics');
    console.log('='.repeat(60));
    console.log(`Total Products (Product table): ${this.stats.totalProducts}`);
    console.log(`Total AllegroProducts: ${this.stats.totalAllegroProducts}`);
    console.log(`✅ Created: ${this.stats.created}`);
    console.log(`🔄 Updated: ${this.stats.updated}`);
    console.log(`⏭️  Skipped: ${this.stats.skipped}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log('='.repeat(60));

    if (this.stats.errorDetails.length > 0) {
      console.log('\n❌ Error Details:');
      this.stats.errorDetails.forEach((error, index) => {
        console.log(`${index + 1}. Product ID: ${error.productId}, SKU: ${error.sku}`);
        console.log(`   Error: ${error.error}\n`);
      });
    }
  }

  /**
   * Run the migration
   */
  async run(): Promise<void> {
    try {
      if (this.exportOnly) {
        await this.exportNormalizedData();
        return;
      }

      const mode = this.dryRun ? '🔍 DRY-RUN MODE (no changes will be made)' : '🚀 LIVE MODE';
      console.log(`${mode} - Starting product migration to catalog-microservice...\n`);
      console.log(`Catalog Service URL: ${process.env.CATALOG_SERVICE_URL || 'http://catalog-microservice:3200'}\n`);
      
      if (this.dryRun) {
        console.log('⚠️  DRY-RUN MODE: No products will be created or updated in catalog-microservice\n');
      }

      // Test connection to catalog-microservice
      try {
        await this.catalogClient.get('/api/products?limit=1');
        console.log('✅ Connected to catalog-microservice\n');
      } catch (error: any) {
        console.warn('⚠️  Could not connect to catalog-microservice, continuing anyway...');
        console.warn(`   Error: ${error.message}\n`);
      }

      // Migrate Product table
      await this.migrateProductsTable();

      // Migrate AllegroProduct table
      await this.migrateAllegroProductsTable();

      // Print statistics
      this.printStats();

      console.log('\n✅ Migration completed!');
    } catch (error: any) {
      console.error('\n❌ Migration failed:', error);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private dedupeRecords(records: NormalizedRecord[]): NormalizedRecord[] {
    const recordMap = new Map<string, NormalizedRecord>();

    for (const record of records) {
      const key = record.sku || record.ean;
      if (!key) {
        recordMap.set(`__missing__${record.legacyId}`, record);
        continue;
      }

      const existing = recordMap.get(key);
      if (!existing) {
        recordMap.set(key, record);
        continue;
      }

      const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const currentUpdated = record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
      const chooseCurrent =
        record.stockQuantity > existing.stockQuantity ||
        (record.stockQuantity === existing.stockQuantity && currentUpdated > existingUpdated);

      if (chooseCurrent) {
        recordMap.set(key, record);
      }
    }

    return Array.from(recordMap.values());
  }

  private buildOfferStockMaps(offers: any[]) {
    const byProductId = new Map<string, { stock: number; updatedAt?: Date }>();
    const byAllegroProductId = new Map<string, { stock: number; updatedAt?: Date }>();

    offers.forEach((offer) => {
      const { productId, allegroProductId, stockQuantity, updatedAt } = offer;
      if (productId) {
        const existing = byProductId.get(productId);
        if (!existing || stockQuantity > existing.stock || (stockQuantity === existing.stock && updatedAt && (!existing.updatedAt || updatedAt > existing.updatedAt))) {
          byProductId.set(productId, { stock: stockQuantity, updatedAt });
        }
      }

      if (allegroProductId) {
        const existing = byAllegroProductId.get(allegroProductId);
        if (!existing || stockQuantity > existing.stock || (stockQuantity === existing.stock && updatedAt && (!existing.updatedAt || updatedAt > existing.updatedAt))) {
          byAllegroProductId.set(allegroProductId, { stock: stockQuantity, updatedAt });
        }
      }
    });

    return { byProductId, byAllegroProductId };
  }

  private async exportNormalizedData(): Promise<void> {
    await this.log('info', 'Starting export-only mode for allegro products', {
      exportPath: this.exportPath,
    });

    const [products, allegroProducts, offers] = await Promise.all([
      this.prisma.product.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.allegroProduct.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.allegroOffer.findMany({
        select: {
          productId: true,
          allegroProductId: true,
          stockQuantity: true,
          updatedAt: true,
          price: true,
          currency: true,
        },
      }),
    ]);

    const { byProductId, byAllegroProductId } = this.buildOfferStockMaps(offers);

    const rawRecords: NormalizedRecord[] = [];

    for (const product of products) {
      const sku = this.normalizeSku(product.code || `ALLEGRO-${product.id}`);
      const ean = this.normalizeEan(product.ean);
      const stock = byProductId.get(product.id)?.stock ?? product.stockQuantity ?? 0;
      const payload = this.mapProductToCatalog(product);
      const notes: string[] = [];
      if (!sku && !ean) {
        notes.push('Missing SKU and EAN');
      }

      rawRecords.push({
        source: 'allegro-product',
        legacyId: product.id,
        sku,
        ean,
        name: product.name || null,
        stockQuantity: stock,
        price: product.sellingPrice ? Number(product.sellingPrice) : null,
        currency: product.sellingPriceCurrency || 'CZK',
        updatedAt: product.updatedAt ? product.updatedAt.toISOString() : null,
        needsManualReview: !sku && !ean,
        notes,
        catalogPayload: payload,
      });
    }

    for (const allegroProduct of allegroProducts) {
      const sku = this.normalizeSku(allegroProduct.ean || `ALLEGRO-${allegroProduct.allegroProductId}`);
      const ean = this.normalizeEan(allegroProduct.ean);
      const stock = byAllegroProductId.get(allegroProduct.id)?.stock ?? 0;
      const payload = this.mapAllegroProductToCatalog(allegroProduct);
      const notes: string[] = [];
      if (!ean) {
        notes.push('No EAN found on AllegroProduct');
      }

      rawRecords.push({
        source: 'allegro-raw',
        legacyId: allegroProduct.id,
        sku,
        ean,
        name: allegroProduct.name || null,
        stockQuantity: stock,
        price: null,
        currency: null,
        updatedAt: allegroProduct.updatedAt ? allegroProduct.updatedAt.toISOString() : null,
        needsManualReview: !ean,
        notes,
        catalogPayload: payload,
      });
    }

    const deduped = this.dedupeRecords(rawRecords);
    const payload = {
      generatedAt: new Date().toISOString(),
      sourceTotals: {
        products: products.length,
        allegroProducts: allegroProducts.length,
        offers: offers.length,
      },
      totalRaw: rawRecords.length,
      totalNormalized: deduped.length,
      records: deduped,
    };

    fs.mkdirSync(path.dirname(this.exportPath), { recursive: true });
    fs.writeFileSync(this.exportPath, JSON.stringify(payload, null, 2), 'utf-8');

    await this.log('info', 'Export completed', {
      exportPath: this.exportPath,
      totalRaw: rawRecords.length,
      totalNormalized: deduped.length,
    });
  }
}

// Run migration if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const exportOnly = args.includes('--export-only') || args.includes('--export');

  let exportPath: string | undefined;
  const outputArgIndex = args.findIndex((arg) => arg === '--output' || arg === '-o');
  const inlineOutputArg = args.find((arg) => arg.startsWith('--output='));

  if (inlineOutputArg) {
    exportPath = inlineOutputArg.split('=')[1];
  } else if (outputArgIndex !== -1 && args[outputArgIndex + 1]) {
    exportPath = args[outputArgIndex + 1];
  }

  if (dryRun) {
    console.log('🔍 Running in DRY-RUN mode - no changes will be made\n');
  }

  if (exportOnly) {
    console.log(`📤 Export-only mode enabled. Output file: ${exportPath || 'tmp/migration/allegro-products-normalized.json'}\n`);
  }

  const migration = new ProductMigrationService(dryRun, exportOnly, exportPath);
  migration.run()
    .then(() => {
      if (dryRun) {
        console.log('\n✅ Dry-run completed successfully - no changes were made');
        console.log('   Run without --dry-run to perform actual migration');
      } else {
        console.log('\n✅ Migration script finished successfully');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { ProductMigrationService };

