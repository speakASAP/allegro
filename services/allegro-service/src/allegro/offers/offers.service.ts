/**
 * Offers Service
 */

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.search) {
      where.title = {
        contains: query.search,
        mode: 'insensitive',
      };
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

    const oauthToken = await this.getUserOAuthToken(userId);
    const response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, {
      limit,
      offset,
    });

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
        currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
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
  async importApprovedOffers(userId: string, approvedOfferIds: string[]) {
    this.logger.log('[importApprovedOffers] Starting import', {
      userId,
      approvedCount: approvedOfferIds.length,
      approvedOfferIds: approvedOfferIds.slice(0, 5), // Log first 5 for debugging
    });

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalImported = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    const approvedSet = new Set(approvedOfferIds);

    // Get OAuth token with detailed logging
    let oauthToken: string;
    try {
      this.logger.log('[importApprovedOffers] Retrieving OAuth token', { userId });
      oauthToken = await this.getUserOAuthToken(userId);
      this.logger.log('[importApprovedOffers] OAuth token retrieved successfully', {
        userId,
        tokenLength: oauthToken?.length || 0,
        tokenFirstChars: oauthToken?.substring(0, 20) || 'N/A',
      });
    } catch (error: any) {
      this.logger.error('[importApprovedOffers] Failed to get OAuth token', {
        userId,
        error: error.message,
        errorCode: error.code,
        errorStatus: error.status,
      });
      throw error; // Re-throw to let controller handle it
    }

    let tokenRefreshAttempted = false;

    while (hasMore) {
      try {
        this.logger.log('[importApprovedOffers] Fetching offers batch from Allegro API', {
          userId,
          offset,
          limit,
          approvedSetSize: approvedSet.size,
          tokenRefreshAttempted,
        });

        const response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, {
          limit,
          offset,
        });

        this.logger.log('[importApprovedOffers] Received response from Allegro API', {
          userId,
          offersCount: response.offers?.length || 0,
          totalCount: response.count || 0,
          offset,
        });

        const offers = response.offers || [];
        
        for (const allegroOffer of offers) {
          // Only import if approved
          if (!approvedSet.has(allegroOffer.id)) {
            continue;
          }

          try {
            this.logger.log('[importApprovedOffers] Importing approved offer', {
              userId,
              offerId: allegroOffer.id,
              offerTitle: allegroOffer.name?.substring(0, 50),
              price: allegroOffer.sellingMode?.price?.amount,
              currency: allegroOffer.sellingMode?.price?.currency,
            });

            // Check if offer already exists to track created vs updated
            const existingOffer = await this.prisma.allegroOffer.findUnique({
              where: { allegroOfferId: allegroOffer.id },
            });

            const offerData = {
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
              currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              rawData: allegroOffer as any,
              syncStatus: 'SYNCED' as const,
              lastSyncedAt: new Date(),
            };

            if (existingOffer) {
              // Update existing offer
              await this.prisma.allegroOffer.update({
                where: { allegroOfferId: allegroOffer.id },
                data: offerData,
              });
              totalUpdated++;
              this.logger.log('[importApprovedOffers] Successfully updated existing offer', {
                userId,
                offerId: allegroOffer.id,
                totalUpdated,
              });
            } else {
              // Create new offer
              await this.prisma.allegroOffer.create({
                data: {
                  allegroOfferId: allegroOffer.id,
                  ...offerData,
                },
              });
              totalCreated++;
              this.logger.log('[importApprovedOffers] Successfully created new offer', {
                userId,
                offerId: allegroOffer.id,
                totalCreated,
              });
            }
            totalImported++;
          } catch (error: any) {
            this.logger.error('[importApprovedOffers] Failed to import approved offer', {
              userId,
              offerId: allegroOffer.id,
              error: error.message,
              errorStack: error.stack,
            });
          }
        }

        hasMore = offers.length === limit;
        offset += limit;
        // Reset token refresh flag on successful request
        tokenRefreshAttempted = false;
      } catch (error: any) {
        const errorStatus = error.response?.status;
        const errorData = error.response?.data || {};
        const errorHeaders = error.response?.headers || {};

        this.logger.error('[importApprovedOffers] Allegro API request failed', {
          userId,
          offset,
          errorStatus,
          errorMessage: error.message,
          errorCode: error.code,
          errorData: JSON.stringify(errorData, null, 2),
          errorHeaders: JSON.stringify(errorHeaders, null, 2),
          errorStack: error.stack,
          tokenRefreshAttempted,
        });

        if ((errorStatus === 403 || errorStatus === 401) && !tokenRefreshAttempted) {
          const allegroError = errorData.errors?.[0] || errorData;
          this.logger.warn('[importApprovedOffers] Access denied - attempting token refresh', {
            userId,
            errorStatus,
            allegroErrorCode: allegroError.code,
            allegroErrorMessage: allegroError.message || allegroError.error_description,
          });

          try {
            // Attempt to force refresh the token
            this.logger.log('[importApprovedOffers] Forcing OAuth token refresh', { userId });
            oauthToken = await this.allegroAuth.refreshUserToken(userId);
            this.logger.log('[importApprovedOffers] Token refreshed successfully, retrying API call', {
              userId,
              newTokenLength: oauthToken?.length || 0,
            });
            tokenRefreshAttempted = true;
            // Retry the same request with new token (don't increment offset)
            continue;
          } catch (refreshError: any) {
            this.logger.error('[importApprovedOffers] Failed to refresh OAuth token', {
              userId,
              refreshError: refreshError.message,
              refreshErrorStack: refreshError.stack,
            });
            throw new Error('OAuth authorization required or token expired. Failed to refresh token. Please go to Settings and re-authorize the application to access your Allegro offers.');
          }
        } else if (errorStatus === 403 || errorStatus === 401) {
          // Already tried refresh, still getting 403/401
          const allegroError = errorData.errors?.[0] || errorData;
          this.logger.error('[importApprovedOffers] Access denied by Allegro API after token refresh - OAuth may be invalid or scopes insufficient', {
            userId,
            errorStatus,
            allegroErrorCode: allegroError.code,
            allegroErrorMessage: allegroError.message || allegroError.error_description,
            fullErrorData: JSON.stringify(errorData, null, 2),
          });
          throw new Error('OAuth authorization required or token expired. The Allegro API returned 403/401 even after token refresh. Please go to Settings and re-authorize the application to access your Allegro offers.');
        }
        
        // Re-throw other errors
        this.logger.error('[importApprovedOffers] Unexpected error during import', {
          userId,
          errorStatus,
          errorMessage: error.message,
          errorData: JSON.stringify(errorData, null, 2),
        });
        throw error;
      }
    }

    this.logger.log('[importApprovedOffers] Finished importing approved offers', {
      userId,
      totalImported,
      totalCreated,
      totalUpdated,
      requestedCount: approvedOfferIds.length,
    });
    return { totalImported, totalCreated, totalUpdated };
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

    if (!userId) {
      throw new Error('OAuth authorization required. User context missing.');
    }
    const oauthToken = await this.getUserOAuthToken(userId);

    while (hasMore) {
      try {
        const response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, {
          limit,
          offset,
        });

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
                currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
                quantity: allegroOffer.stock?.available || 0,
                stockQuantity: allegroOffer.stock?.available || 0,
                status: allegroOffer.publication?.status || 'INACTIVE',
                rawData: allegroOffer as any,
                syncStatus: 'SYNCED',
                lastSyncedAt: new Date(),
              },
              create: {
                allegroOfferId: allegroOffer.id,
                title: allegroOffer.name,
                description: allegroOffer.description,
                categoryId: allegroOffer.category?.id || '',
                price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
                currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
                quantity: allegroOffer.stock?.available || 0,
                stockQuantity: allegroOffer.stock?.available || 0,
                status: allegroOffer.publication?.status || 'INACTIVE',
                rawData: allegroOffer as any,
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
  async previewOffersFromSalesCenter(userId: string) {
    this.logger.log('Previewing offers from Allegro Sales Center', { userId });

    const limit = 100;
    const queryParams: any = {
      limit: limit.toString(),
      offset: '0',
    };
    
    let response;
    try {
      const oauthToken = await this.allegroAuth.getUserAccessToken(userId);
      response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, queryParams);
    } catch (error: any) {
      const errorStatus = error.response?.status;
      const errorData = error.response?.data || {};

      if (
        errorStatus === 401 ||
        errorStatus === 403 ||
        error.message?.includes('OAuth authorization required')
      ) {
        this.logger.warn('OAuth authorization required for Sales Center preview', {
          userId,
          errorStatus,
          errorData,
        });
        throw new Error('OAuth authorization required. Please authorize the application in Settings to access your Allegro offers.');
      }

      this.logger.error('Failed to preview offers from Sales Center', {
        userId,
        error: error.message,
        errorStatus,
        errorData,
      });
      throw error;
    }

    const offers = response?.offers || [];
    
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
      currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
      rawData: allegroOffer,
    }));

    this.logger.log('Finished previewing offers from Sales Center', { total: previewOffers.length, userId });
    return { items: previewOffers, total: response?.count || previewOffers.length };
  }

  /**
   * Import approved offers from Sales Center preview
   */
  async importApprovedOffersFromSalesCenter(userId: string, approvedOfferIds: string[]) {
    this.logger.log('Importing approved offers from Sales Center', { count: approvedOfferIds.length, userId });

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
      
      let response;
      try {
        const oauthToken = await this.allegroAuth.getUserAccessToken(userId);
        response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, queryParams);
      } catch (error: any) {
        const errorStatus = error.response?.status;
        const errorData = error.response?.data || {};
        if (
          errorStatus === 401 ||
          errorStatus === 403 ||
          error.message?.includes('OAuth authorization required')
        ) {
          this.logger.warn('OAuth authorization required for Sales Center import', {
            userId,
            errorStatus,
            errorData,
          });
          throw new Error('OAuth authorization required. Please authorize the application in Settings to access your Allegro offers.');
        }

        this.logger.error('Failed to import approved offers from Sales Center', {
          userId,
          error: error.message,
          errorStatus,
          errorData,
        });
        throw error;
      }
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
              currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              rawData: allegroOffer,
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
            create: {
              allegroOfferId: allegroOffer.id,
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
              currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              rawData: allegroOffer,
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

    this.logger.log('Finished importing approved offers from Sales Center', { totalImported, userId });
    return { totalImported };
  }

  /**
   * Import offers from Allegro Sales Center (my-assortment)
   */
  async importFromSalesCenter(userId: string) {
    this.logger.log('Importing offers from Allegro Sales Center', { userId });

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
      
      let response;
      try {
        const oauthToken = await this.allegroAuth.getUserAccessToken(userId);
        response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, queryParams);
      } catch (error: any) {
        const errorStatus = error.response?.status;
        const errorData = error.response?.data || {};
        if (
          errorStatus === 401 ||
          errorStatus === 403 ||
          error.message?.includes('OAuth authorization required')
        ) {
          this.logger.warn('OAuth authorization required for Sales Center import', {
            userId,
            errorStatus,
            errorData,
          });
          throw new Error('OAuth authorization required. Please authorize the application in Settings to access your Allegro offers.');
        }

        this.logger.error('Failed to import offers from Sales Center', {
          userId,
          error: error.message,
          errorStatus,
          errorData,
        });
        throw error;
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
                currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              rawData: allegroOffer,
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
              create: {
              allegroOfferId: allegroOffer.id,
              title: allegroOffer.name,
              description: allegroOffer.description,
              categoryId: allegroOffer.category?.id || '',
              price: parseFloat(allegroOffer.sellingMode?.price?.amount || '0'),
                currency: allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency(),
              quantity: allegroOffer.stock?.available || 0,
              stockQuantity: allegroOffer.stock?.available || 0,
              status: allegroOffer.publication?.status || 'INACTIVE',
              publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
              rawData: allegroOffer,
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

    this.logger.log('Finished importing offers from Sales Center', { totalImported, userId });
    return { totalImported };
  }

  private async getUserOAuthToken(userId: string): Promise<string> {
    try {
      this.logger.log('[getUserOAuthToken] Retrieving OAuth token', { userId });
      const token = await this.allegroAuth.getUserAccessToken(userId);
      this.logger.log('[getUserOAuthToken] OAuth token retrieved successfully', {
        userId,
        tokenLength: token?.length || 0,
        tokenFirstChars: token?.substring(0, 20) || 'N/A',
      });
      return token;
    } catch (error: any) {
      this.logger.error('[getUserOAuthToken] Failed to get OAuth token', {
        userId,
        error: error.message,
        errorCode: error.code,
        errorStatus: error.status,
        errorStack: error.stack,
      });
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'OAUTH_REQUIRED',
            message: 'OAuth authorization required. Please authorize the application in Settings to access your Allegro offers.',
            status: HttpStatus.FORBIDDEN,
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private getDefaultCurrency(): string {
    return this.configService.get('PRICE_CURRENCY_TARGET') || 'CZK';
  }
}

