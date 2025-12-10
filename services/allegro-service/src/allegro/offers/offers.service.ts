/**
 * Offers Service
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';
import { ConfigService } from '@nestjs/config';
import { AllegroApiService } from '../allegro-api.service';
import { AllegroAuthService } from '../allegro-auth.service';
import * as crypto from 'crypto';

@Injectable()
export class OffersService {
  private readonly encryptionKey: string;
  private readonly encryptionAlgorithm = 'aes-256-cbc';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
    private readonly configService: ConfigService,
    private readonly allegroAuth: AllegroAuthService,
  ) {
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_KEY must be configured in .env file');
    }
    if (this.encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted text format');
      }
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = Buffer.from(parts[1], 'hex');
      const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, Buffer.from(this.encryptionKey.substring(0, 32), 'utf8'), iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error('Failed to decrypt data', { error: error.message });
      throw error;
    }
  }

  /**
   * Get offers from database
   */
  async getOffers(query: any): Promise<{ items: any[]; pagination: any }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.allegroOffer.findMany({
        where,
        skip,
        take: limit,
        include: {
          product: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.allegroOffer.count({ where }),
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
   * Get offer by ID
   */
  async getOffer(id: string): Promise<any> {
    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
      include: {
        product: true,
      },
    });

    if (!offer) {
      throw new Error(`Offer with ID ${id} not found`);
    }

    return offer;
  }

  /**
   * Create offer
   */
  async createOffer(dto: any): Promise<any> {
    this.logger.log('Creating Allegro offer', { productId: dto.productId });

    // Create offer via Allegro API
    const allegroOffer = await this.allegroApi.createOffer(dto);

    // Save to database
    const offer = await this.prisma.allegroOffer.create({
      data: {
        allegroOfferId: allegroOffer.id,
        productId: dto.productId,
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        price: dto.price,
        quantity: dto.quantity,
        stockQuantity: dto.quantity,
        status: 'ACTIVE',
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    return offer;
  }

  /**
   * Update offer
   */
  async updateOffer(id: string, dto: any): Promise<any> {
    this.logger.log('Updating Allegro offer', { id });

    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new Error(`Offer with ID ${id} not found`);
    }

    // Update via Allegro API
    await this.allegroApi.updateOffer(offer.allegroOfferId, dto);

    // Update in database
    const updated = await this.prisma.allegroOffer.update({
      where: { id },
      data: {
        ...dto,
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Delete offer
   */
  async deleteOffer(id: string) {
    this.logger.log('Deleting Allegro offer', { id });

    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new Error(`Offer with ID ${id} not found`);
    }

    // Delete via Allegro API
    await this.allegroApi.deleteOffer(offer.allegroOfferId);

    // Delete from database
    await this.prisma.allegroOffer.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Update stock
   */
  async updateStock(id: string, quantity: number): Promise<any> {
    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new Error(`Offer with ID ${id} not found`);
    }

    // Update via Allegro API
    await this.allegroApi.updateOfferStock(offer.allegroOfferId, quantity);

    // Update in database
    const updated = await this.prisma.allegroOffer.update({
      where: { id },
      data: {
        stockQuantity: quantity,
        quantity,
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Preview offers from Allegro (without importing)
   */
  async previewOffersFromAllegro(userId: string) {
    this.logger.log('Previewing offers from Allegro', { userId });

    let offset = 0;
    const limit = 100;
    const previewOffers: any[] = [];

    // Try to use OAuth token first (for accessing user-specific resources)
    let response;
    try {
      const oauthToken = await this.allegroAuth.getUserAccessToken(userId);
      this.logger.log('Using OAuth token for Allegro API', { userId });
      // Use OAuth token directly in API call
      response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, {
        limit,
        offset,
      });
    } catch (oauthError: any) {
      // Check if error is specifically about OAuth being required
      if (oauthError.message && oauthError.message.includes('OAuth authorization required')) {
        // Don't fall back to client credentials - OAuth is required
        this.logger.warn('OAuth authorization required for accessing user offers', { userId });
        throw new Error('OAuth authorization required. Please authorize the application in Settings to access your Allegro offers.');
      }
      
      // OAuth not available or failed, fall back to client credentials
      this.logger.debug('OAuth token not available, falling back to client credentials', {
        userId,
        error: oauthError.message,
      });

      // Get user settings to check for user-specific credentials
      let userClientId: string | null = null;
      let userClientSecret: string | null = null;

      try {
        const settings = await this.prisma.userSettings.findUnique({
          where: { userId },
        });

        if (settings?.allegroClientId && settings?.allegroClientSecret) {
          userClientId = settings.allegroClientId;
          try {
            userClientSecret = this.decrypt(settings.allegroClientSecret);
            this.logger.log('Using user-specific Allegro credentials', { userId });
          } catch (error) {
            this.logger.warn('Failed to decrypt user credentials, falling back to global credentials', { userId });
          }
        }
      } catch (error) {
        this.logger.warn('Failed to get user settings, using global credentials', { userId, error: error.message });
      }

      // Get first batch for preview (limit to 100 items for preview)
      try {
        if (userClientId && userClientSecret) {
          // Use user-specific credentials
          response = await this.allegroApi.getOffersWithCredentials(userClientId, userClientSecret, {
            limit,
            offset,
          });
        } else {
          // Use global credentials
          response = await this.allegroApi.getOffers({
            limit,
            offset,
          });
        }
      } catch (apiError: any) {
        // Client credentials cannot access /sale/offers endpoint - OAuth is required
        const errorStatus = apiError.response?.status;
        const errorData = apiError.response?.data || {};
        
        if (errorStatus === 403 || errorStatus === 401) {
          this.logger.warn('Client credentials cannot access user offers - OAuth required', {
            userId,
            errorStatus,
            errorData,
          });
          throw new Error('OAuth authorization required. The /sale/offers endpoint requires OAuth authorization code flow. Please authorize the application in Settings to access your Allegro offers.');
        }
        
        // Re-throw other errors
        this.logger.error('Failed to get offers with client credentials', {
          userId,
          error: apiError.message,
          errorStatus,
          errorData,
        });
        throw apiError;
      }
    }

    if (!response) {
      throw new Error('Failed to retrieve offers from Allegro API');
    }

    const offers = response.offers || [];
    
    for (const allegroOffer of offers) {
      previewOffers.push({
        allegroOfferId: allegroOffer.id,
        title: allegroOffer.name,
        description: allegroOffer.description,
        categoryId: allegroOffer.category?.id || '',
        price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
        quantity: allegroOffer.stock?.available || 0,
        stockQuantity: allegroOffer.stock?.available || 0,
        status: allegroOffer.publication?.status || 'INACTIVE',
        publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
        rawData: allegroOffer, // Keep raw data for reference
      });
    }

    this.logger.log('Finished previewing offers', { total: previewOffers.length, userId });
    return { items: previewOffers, total: response.count || previewOffers.length };
  }

  /**
   * Import approved offers from preview
   */
  async importApprovedOffers(approvedOfferIds: string[]) {
    this.logger.log('Importing approved offers', { count: approvedOfferIds.length });

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalImported = 0;
    const approvedSet = new Set(approvedOfferIds);

    while (hasMore) {
      const response = await this.allegroApi.getOffers({
        limit,
        offset,
      });

      const offers = response.offers || [];
      
      for (const allegroOffer of offers) {
        // Only import if approved
        if (!approvedSet.has(allegroOffer.id)) {
          continue;
        }

        try {
          await this.prisma.allegroOffer.upsert({
            where: { allegroOfferId: allegroOffer.id },
            update: {
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
            create: {
              allegroOfferId: allegroOffer.id,
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
          });
          totalImported++;
        } catch (error: any) {
          this.logger.error('Failed to import approved offer', {
            offerId: allegroOffer.id,
            error: error.message,
          });
        }
      }

      hasMore = offers.length === limit;
      offset += limit;
    }

    this.logger.log('Finished importing approved offers', { totalImported });
    return { totalImported };
  }

  /**
   * Import all offers from Allegro
   */
  async importAllOffers(userId?: string) {
    this.logger.log('Importing all offers from Allegro', { userId });

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalImported = 0;

    // Determine if we should use OAuth token (for accessing user-specific resources)
    let useOAuth = false;
    
    if (userId) {
      try {
        // Try to get OAuth token to check if it's available
        await this.allegroAuth.getUserAccessToken(userId);
        this.logger.log('Using OAuth token for Allegro API import', { userId });
        useOAuth = true;
      } catch (oauthError: any) {
        // Check if error is specifically about OAuth being required
        if (oauthError.message && oauthError.message.includes('OAuth authorization required')) {
          this.logger.warn('OAuth authorization required for importing offers', { userId });
          throw new Error('OAuth authorization required. To import offers from Allegro, you need to authorize the application. Please go to Settings and click "Authorize with Allegro" to grant access to your Allegro account.');
        }
        
        // OAuth not available or failed, fall back to client credentials
        this.logger.debug('OAuth token not available, falling back to client credentials', {
          userId,
          error: oauthError.message,
        });
        useOAuth = false;
      }
    }

    while (hasMore) {
      try {
        let response;
        if (useOAuth && userId) {
          // Use OAuth token for this batch
          const oauthToken = await this.allegroAuth.getUserAccessToken(userId);
          response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, {
            limit,
            offset,
          });
        } else {
          // Fall back to client credentials (may not work for /sale/offers)
          response = await this.allegroApi.getOffers({
            limit,
            offset,
          });
        }

        const offers = response.offers || [];
        
        for (const allegroOffer of offers) {
          try {
            await this.prisma.allegroOffer.upsert({
              where: { allegroOfferId: allegroOffer.id },
              update: {
                title: allegroOffer.name,
                description: allegroOffer.description,
                categoryId: allegroOffer.category?.id || '',
                price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
                quantity: allegroOffer.stock?.available || 0,
                stockQuantity: allegroOffer.stock?.available || 0,
                status: allegroOffer.publication?.status || 'INACTIVE',
                syncStatus: 'SYNCED',
                lastSyncedAt: new Date(),
              },
              create: {
                allegroOfferId: allegroOffer.id,
                title: allegroOffer.name,
                description: allegroOffer.description,
                categoryId: allegroOffer.category?.id || '',
                price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
                quantity: allegroOffer.stock?.available || 0,
                stockQuantity: allegroOffer.stock?.available || 0,
                status: allegroOffer.publication?.status || 'INACTIVE',
                syncStatus: 'SYNCED',
                lastSyncedAt: new Date(),
              },
            });
            totalImported++;
          } catch (error: any) {
            this.logger.error('Failed to import offer', {
              offerId: allegroOffer.id,
              error: error.message,
            });
          }
        }

        hasMore = offers.length === limit;
        offset += limit;
      } catch (error: any) {
        const errorStatus = error.response?.status;
        const errorData = error.response?.data || {};
        
        if (errorStatus === 403 || errorStatus === 401) {
          this.logger.error('Access denied when importing offers - OAuth may be required', {
            userId,
            errorStatus,
            errorData,
          });
          throw new Error('OAuth authorization required. The Allegro API requires OAuth authorization to access your offers. Please go to Settings and click "Authorize with Allegro" to grant access to your Allegro account. After authorization, you will be able to import offers.');
        }
        
        // Re-throw other errors
        this.logger.error('Failed to import offers', {
          userId,
          error: error.message,
          errorStatus,
          errorData,
        });
        throw error;
      }
    }

    this.logger.log('Finished importing offers', { totalImported, userId });
    return { totalImported };
  }

  /**
   * Export offers to CSV
   */
  async exportToCsv(): Promise<string> {
    this.logger.log('Exporting offers to CSV');

    const offers = await this.prisma.allegroOffer.findMany({
      include: {
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // CSV header
    const headers = [
      'Allegro Offer ID',
      'Title',
      'Price',
      'Currency',
      'Stock Quantity',
      'Status',
      'Publication Status',
      'Category ID',
      'Product Code',
      'Product Name',
      'Created At',
      'Last Synced At',
    ];

    // CSV rows
    const rows = offers.map((offer) => [
      offer.allegroOfferId || '',
      offer.title || '',
      String(offer.price || 0),
      offer.currency || 'PLN',
      String(offer.stockQuantity || 0),
      offer.status || '',
      offer.publicationStatus || '',
      offer.categoryId || '',
      offer.product?.code || '',
      offer.product?.name || '',
      offer.createdAt.toISOString(),
      offer.lastSyncedAt ? offer.lastSyncedAt.toISOString() : '',
    ]);

    // Combine header and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Preview offers from Allegro Sales Center (without importing)
   */
  async previewOffersFromSalesCenter() {
    this.logger.log('Previewing offers from Allegro Sales Center');

    const limit = 100;
    const queryParams: any = {
      limit: limit.toString(),
      offset: '0',
    };
    
    const response = await this.allegroApi.getOffers(queryParams);
    const offers = response.offers || [];
    
    const previewOffers = offers.map((allegroOffer: any) => ({
      allegroOfferId: allegroOffer.id,
      title: allegroOffer.name,
      description: allegroOffer.description,
      categoryId: allegroOffer.category?.id || '',
      price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
      quantity: allegroOffer.stock?.available || 0,
      stockQuantity: allegroOffer.stock?.available || 0,
      status: allegroOffer.publication?.status || 'INACTIVE',
      publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
      rawData: allegroOffer,
    }));

    this.logger.log('Finished previewing offers from Sales Center', { total: previewOffers.length });
    return { items: previewOffers, total: response.count || previewOffers.length };
  }

  /**
   * Import approved offers from Sales Center preview
   */
  async importApprovedOffersFromSalesCenter(approvedOfferIds: string[]) {
    this.logger.log('Importing approved offers from Sales Center', { count: approvedOfferIds.length });

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalImported = 0;
    const approvedSet = new Set(approvedOfferIds);

    while (hasMore) {
      const queryParams: any = {
        limit: limit.toString(),
        offset: offset.toString(),
      };
      
      const response = await this.allegroApi.getOffers(queryParams);
      const offers = response.offers || [];
      
      for (const allegroOffer of offers) {
        if (!approvedSet.has(allegroOffer.id)) {
          continue;
        }

        try {
          await this.prisma.allegroOffer.upsert({
            where: { allegroOfferId: allegroOffer.id },
            update: {
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
            create: {
              allegroOfferId: allegroOffer.id,
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
          });
          totalImported++;
        } catch (error: any) {
          this.logger.error('Failed to import approved offer from Sales Center', {
            offerId: allegroOffer.id,
            error: error.message,
          });
        }
      }

      hasMore = offers.length === limit;
      offset += limit;
    }

    this.logger.log('Finished importing approved offers from Sales Center', { totalImported });
    return { totalImported };
  }

  /**
   * Import offers from Allegro Sales Center (my-assortment)
   */
  async importFromSalesCenter() {
    this.logger.log('Importing offers from Allegro Sales Center');

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalImported = 0;

    // Use the same API endpoint but with different parameters for Sales Center
    // The Sales Center uses the same offers endpoint but with publication.status=ACTIVE filter
    while (hasMore) {
      // Build query params manually to handle nested keys
      const queryParams: any = {
        limit: limit.toString(),
        offset: offset.toString(),
      };
      
      const response = await this.allegroApi.getOffers(queryParams);

      const offers = response.offers || [];
      
      for (const allegroOffer of offers) {
        try {
          await this.prisma.allegroOffer.upsert({
            where: { allegroOfferId: allegroOffer.id },
            update: {
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
            create: {
              allegroOfferId: allegroOffer.id,
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
          });
          totalImported++;
        } catch (error: any) {
          this.logger.error('Failed to import offer from Sales Center', {
            offerId: allegroOffer.id,
            error: error.message,
          });
        }
      }

      hasMore = offers.length === limit;
      offset += limit;
    }

    this.logger.log('Finished importing offers from Sales Center', { totalImported });
    return { totalImported };
  }
}

