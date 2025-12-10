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

    this.logger.log('Fetching offers from database', {
      filters: {
        status: query.status,
        categoryId: query.categoryId,
        search: query.search,
      },
      pagination: { page, limit, skip },
    });

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

    this.logger.log('Offers fetched from database', {
      total,
      returned: items.length,
      page,
      limit,
    });

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
    this.logger.log('Fetching offer by ID from database', { offerId: id });

    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
      include: {
        product: true,
      },
    });

    if (!offer) {
      this.logger.warn('Offer not found', { offerId: id });
      throw new Error(`Offer with ID ${id} not found`);
    }

    this.logger.log('Offer fetched from database', {
      offerId: id,
      allegroOfferId: offer.allegroOfferId,
      hasRawData: !!offer.rawData,
      hasProduct: !!offer.product,
    });

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
        syncSource: 'MANUAL',
        lastSyncedAt: new Date(),
      },
    });

    return offer;
  }

  /**
   * Transform DTO to Allegro API format
   * For PATCH requests, we must include all required fields from existing offer
   */
  private transformDtoToAllegroFormat(dto: any, existingOffer: any): any {
    const payload: any = {};

    // Basic fields
    if (dto.title !== undefined) {
      payload.name = dto.title;
    } else if (existingOffer.rawData?.name) {
      payload.name = existingOffer.rawData.name;
    }

    if (dto.description !== undefined) {
      payload.description = dto.description;
    } else if (existingOffer.rawData?.description) {
      payload.description = existingOffer.rawData.description;
    }

    // Category - always include (required)
    if (dto.categoryId !== undefined) {
      payload.category = { id: dto.categoryId };
    } else if (existingOffer.rawData?.category?.id) {
      payload.category = { id: existingOffer.rawData.category.id };
    } else if (existingOffer.categoryId) {
      payload.category = { id: existingOffer.categoryId };
    }

    // Selling mode (price) - always include if exists
    if (dto.price !== undefined || dto.currency !== undefined) {
      payload.sellingMode = {
        ...(existingOffer.rawData?.sellingMode || {}),
        price: {
          amount: String(dto.price !== undefined ? dto.price : existingOffer.price),
          currency: dto.currency || existingOffer.currency || this.getDefaultCurrency(),
        },
      };
    } else if (existingOffer.rawData?.sellingMode) {
      payload.sellingMode = existingOffer.rawData.sellingMode;
    }

    // Stock - always include if exists
    if (dto.stockQuantity !== undefined || dto.quantity !== undefined) {
      const stockQty = dto.stockQuantity !== undefined ? dto.stockQuantity : dto.quantity;
      payload.stock = {
        ...(existingOffer.rawData?.stock || {}),
        available: stockQty,
      };
    } else if (existingOffer.rawData?.stock) {
      payload.stock = existingOffer.rawData.stock;
    }

    // Images - always include (required by Allegro API)
    // If updating, use new images; otherwise preserve existing images
    if (dto.images !== undefined && dto.images.length > 0) {
      payload.images = dto.images.map((url: string) => ({ url }));
    } else if (existingOffer.rawData?.images && Array.isArray(existingOffer.rawData.images)) {
      // Preserve existing images if not updating
      payload.images = existingOffer.rawData.images;
    } else if (existingOffer.images && Array.isArray(existingOffer.images)) {
      // Fallback to images field if rawData.images not available
      payload.images = existingOffer.images.map((url: string) => ({ url }));
    }

    // Parameters/attributes - always include all existing parameters (required)
    // Merge updated parameters from DTO with existing ones
    // Check both rawData.parameters and direct parameters (for API responses)
    const existingParams = existingOffer.rawData?.parameters || 
                          existingOffer.parameters || 
                          existingOffer.rawData?.product?.parameters || 
                          [];
    if (dto.attributes !== undefined && Array.isArray(dto.attributes)) {
      // Update specific parameters from DTO
      const updatedParams = dto.attributes.map((attr: any) => ({
        id: attr.id,
        values: attr.values,
      }));
      // Keep non-updated parameters from existing offer
      const otherParams = existingParams.filter((p: any) => 
        !dto.attributes.some((a: any) => a.id === p.id)
      );
      payload.parameters = [...otherParams, ...updatedParams];
    } else if (existingParams.length > 0) {
      // Include all existing parameters if not updating
      payload.parameters = existingParams;
    }

    // Publication status
    if (dto.publicationStatus !== undefined) {
      payload.publication = {
        ...(existingOffer.rawData?.publication || {}),
        status: dto.publicationStatus,
      };
    } else if (existingOffer.rawData?.publication) {
      payload.publication = existingOffer.rawData.publication;
    }

    // Delivery options - include if exists
    if (dto.deliveryOptions !== undefined) {
      payload.delivery = dto.deliveryOptions;
    } else if (existingOffer.rawData?.delivery) {
      payload.delivery = existingOffer.rawData.delivery;
    }

    // Payment options - include if exists
    if (dto.paymentOptions !== undefined) {
      payload.payments = dto.paymentOptions;
    } else if (existingOffer.rawData?.payments) {
      payload.payments = existingOffer.rawData.payments;
    }

    return payload;
  }

  /**
   * Fetch updated offer from Allegro API
   */
  private async fetchUpdatedOfferFromAllegro(allegroOfferId: string): Promise<any> {
    try {
      // Use getOffers endpoint with specific offer ID filter, or implement getOfferById if available
      // For now, we'll merge updates into existing rawData
      // In a full implementation, we'd call GET /sale/offers/{offerId}
      return null; // Will merge instead
    } catch (error: any) {
      this.logger.warn('Failed to fetch updated offer from Allegro', {
        allegroOfferId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Merge updates into rawData
   */
  private mergeRawDataUpdates(existingRawData: any, updates: any, dto: any): any {
    if (!existingRawData) {
      return updates;
    }

    const merged = { ...existingRawData };

    // Merge basic fields
    if (dto.title !== undefined) merged.name = dto.title;
    if (dto.description !== undefined) merged.description = dto.description;
    if (dto.categoryId !== undefined) {
      merged.category = { ...(merged.category || {}), id: dto.categoryId };
    }

    // Merge selling mode
    if (dto.price !== undefined || dto.currency !== undefined) {
      merged.sellingMode = {
        ...(merged.sellingMode || {}),
        price: {
          amount: String(dto.price !== undefined ? dto.price : existingRawData.sellingMode?.price?.amount || '0'),
          currency: dto.currency || existingRawData.sellingMode?.price?.currency || this.getDefaultCurrency(),
        },
      };
    }

    // Merge stock
    if (dto.stockQuantity !== undefined || dto.quantity !== undefined) {
      const stockQty = dto.stockQuantity !== undefined ? dto.stockQuantity : dto.quantity;
      merged.stock = {
        ...(merged.stock || {}),
        available: stockQty,
      };
    }

    // Merge images
    if (dto.images !== undefined) {
      merged.images = dto.images.map((url: string) => ({ url }));
    }

    // Merge parameters
    if (dto.attributes !== undefined && Array.isArray(dto.attributes)) {
      const existingParams = merged.parameters || [];
      const updatedParams = dto.attributes.map((attr: any) => {
        const existing = existingParams.find((p: any) => p.id === attr.id);
        return {
          ...existing,
          id: attr.id,
          values: attr.values,
        };
      });
      // Keep non-updated parameters
      const otherParams = existingParams.filter((p: any) => !dto.attributes.some((a: any) => a.id === p.id));
      merged.parameters = [...otherParams, ...updatedParams];
    }

    // Merge publication
    if (dto.publicationStatus !== undefined) {
      merged.publication = {
        ...(merged.publication || {}),
        status: dto.publicationStatus,
      };
    }

    // Merge delivery and payment
    if (dto.deliveryOptions !== undefined) {
      merged.delivery = dto.deliveryOptions;
    }
    if (dto.paymentOptions !== undefined) {
      merged.payments = dto.paymentOptions;
    }

    return merged;
  }

  /**
   * Update offer
   */
  async updateOffer(id: string, dto: any, userId?: string): Promise<any> {
    this.logger.log('Updating Allegro offer', { id, fields: Object.keys(dto), userId });

    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new HttpException('Offer not found', HttpStatus.NOT_FOUND);
    }

    try {
      // Get user's OAuth token for updating offers (required for user-specific operations)
      let oauthToken: string;
      if (userId) {
        oauthToken = await this.getUserOAuthToken(userId);
      } else {
        // Fallback to client credentials token (may not work for all operations)
        oauthToken = await this.allegroAuth.getAccessToken();
      }

      // Fetch current offer from Allegro API to ensure we have all required fields
      // This ensures we have the latest parameters and required fields
      let currentAllegroOffer: any = null;
      try {
        currentAllegroOffer = await this.allegroApi.getOfferWithOAuthToken(oauthToken, offer.allegroOfferId);
        this.logger.log('Fetched current offer from Allegro API', {
          allegroOfferId: offer.allegroOfferId,
          hasParameters: !!currentAllegroOffer?.parameters,
          parametersCount: currentAllegroOffer?.parameters?.length || 0,
        });
      } catch (error: any) {
        this.logger.warn('Failed to fetch current offer from Allegro API, using stored rawData', {
          allegroOfferId: offer.allegroOfferId,
          error: error.message,
        });
      }

      // Use current offer from API if available, otherwise use stored rawData
      const sourceOffer = currentAllegroOffer || offer.rawData || offer;

      // Transform DTO to Allegro API format
      const allegroPayload = this.transformDtoToAllegroFormat(dto, { ...offer, rawData: sourceOffer });

      // Update via Allegro API with OAuth token
      this.logger.log('Updating offer via Allegro API', {
        allegroOfferId: offer.allegroOfferId,
        payloadKeys: Object.keys(allegroPayload),
        parametersCount: allegroPayload.parameters?.length || 0,
        usingOAuthToken: !!userId,
      });
      await this.allegroApi.updateOfferWithOAuthToken(oauthToken, offer.allegroOfferId, allegroPayload);

      // Merge updates into rawData
      const updatedRawData = this.mergeRawDataUpdates(offer.rawData as any, allegroPayload, dto);

      // Prepare database update data
      const dbUpdateData: any = {
        syncStatus: 'SYNCED',
        syncSource: 'MANUAL',
        lastSyncedAt: new Date(),
        syncError: null,
      };

      // Update fields that changed
      if (dto.title !== undefined) dbUpdateData.title = dto.title;
      if (dto.description !== undefined) dbUpdateData.description = dto.description;
      if (dto.categoryId !== undefined) dbUpdateData.categoryId = dto.categoryId;
      if (dto.price !== undefined) dbUpdateData.price = dto.price;
      if (dto.currency !== undefined) dbUpdateData.currency = dto.currency;
      if (dto.stockQuantity !== undefined) {
        dbUpdateData.stockQuantity = dto.stockQuantity;
        dbUpdateData.quantity = dto.stockQuantity;
      } else if (dto.quantity !== undefined) {
        dbUpdateData.quantity = dto.quantity;
        dbUpdateData.stockQuantity = dto.quantity;
      }
      if (dto.images !== undefined) dbUpdateData.images = dto.images;
      if (dto.status !== undefined) dbUpdateData.status = dto.status;
      if (dto.publicationStatus !== undefined) dbUpdateData.publicationStatus = dto.publicationStatus;
      if (dto.deliveryOptions !== undefined) dbUpdateData.deliveryOptions = dto.deliveryOptions;
      if (dto.paymentOptions !== undefined) dbUpdateData.paymentOptions = dto.paymentOptions;

      // Update rawData
      dbUpdateData.rawData = updatedRawData;

      // Update in database
      const updated = await this.prisma.allegroOffer.update({
        where: { id },
        data: dbUpdateData,
      });

      // Re-validate offer
      const validation = this.validateOfferReadiness(updated);
      await this.prisma.allegroOffer.update({
        where: { id },
        data: {
          validationStatus: validation.status,
          validationErrors: validation.errors as any,
          lastValidatedAt: new Date(),
        },
      });

      this.logger.log('Offer updated successfully', {
        id,
        allegroOfferId: offer.allegroOfferId,
        validationStatus: validation.status,
      });

      // Fetch updated offer with validation
      const finalOffer = await this.prisma.allegroOffer.findUnique({
        where: { id },
      });

      return finalOffer;
    } catch (error: any) {
      this.logger.error('Failed to update offer', {
        id,
        allegroOfferId: offer.allegroOfferId,
        error: error.message,
        errorStack: error.stack,
      });

      // Update sync status to ERROR
      await this.prisma.allegroOffer.update({
        where: { id },
        data: {
          syncStatus: 'ERROR',
          syncError: error.message || 'Failed to update offer',
        },
      });

      // Re-throw with user-friendly message
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update offer';
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'UPDATE_ERROR',
            message: errorMessage,
            details: error.response?.data,
          },
        },
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
        syncSource: 'MANUAL',
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

            const images = this.extractImages(allegroOffer);
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
              images: images,
              rawData: allegroOffer as any,
              syncStatus: 'SYNCED' as const,
              syncSource: 'ALLEGRO_API' as const,
              lastSyncedAt: new Date(),
            };

            if (existingOffer) {
              // Update existing offer
              const updated = await this.prisma.allegroOffer.update({
                where: { allegroOfferId: allegroOffer.id },
                data: offerData,
              });
              // Run validation
              const validation = this.validateOfferReadiness(updated);
              await this.prisma.allegroOffer.update({
                where: { allegroOfferId: allegroOffer.id },
                data: {
                  validationStatus: validation.status,
                  validationErrors: validation.errors as any,
                  lastValidatedAt: new Date(),
                },
              });
              totalUpdated++;
              this.logger.log('[importApprovedOffers] Successfully updated existing offer', {
                userId,
                offerId: allegroOffer.id,
                totalUpdated,
              });
            } else {
              // Create new offer
              const created = await this.prisma.allegroOffer.create({
                data: {
                  allegroOfferId: allegroOffer.id,
                  ...offerData,
                  syncSource: 'ALLEGRO_API',
                },
              });
              // Run validation
              const validation = this.validateOfferReadiness(created);
              await this.prisma.allegroOffer.update({
                where: { id: created.id },
                data: {
                  validationStatus: validation.status,
                  validationErrors: validation.errors as any,
                  lastValidatedAt: new Date(),
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
            const images = this.extractImages(allegroOffer);
            const offer = await this.prisma.allegroOffer.upsert({
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
                images: images,
                rawData: allegroOffer as any,
                syncStatus: 'SYNCED',
                syncSource: 'ALLEGRO_API',
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
                images: images,
                rawData: allegroOffer as any,
                syncStatus: 'SYNCED',
                syncSource: 'ALLEGRO_API',
                lastSyncedAt: new Date(),
              },
            });
            // Run validation
            const validation = this.validateOfferReadiness(offer);
            await this.prisma.allegroOffer.update({
              where: { id: offer.id },
              data: {
                validationStatus: validation.status,
                validationErrors: validation.errors as any,
                lastValidatedAt: new Date(),
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
    this.logger.log('[importApprovedOffersFromSalesCenter] Starting import', {
      userId,
      approvedCount: approvedOfferIds.length,
      approvedOfferIds: approvedOfferIds.slice(0, 5), // Log first 5 for debugging
    });

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalImported = 0;
    const approvedSet = new Set(approvedOfferIds);

    // Get OAuth token with detailed logging
    let oauthToken: string;
    try {
      this.logger.log('[importApprovedOffersFromSalesCenter] Retrieving OAuth token', { userId });
      oauthToken = await this.allegroAuth.getUserAccessToken(userId);
      this.logger.log('[importApprovedOffersFromSalesCenter] OAuth token retrieved successfully', {
        userId,
        tokenLength: oauthToken?.length || 0,
        tokenFirstChars: oauthToken?.substring(0, 20) || 'N/A',
      });
    } catch (error: any) {
      this.logger.error('[importApprovedOffersFromSalesCenter] Failed to get OAuth token', {
        userId,
        error: error.message,
        errorCode: error.code,
        errorStatus: error.status,
      });
      throw error; // Re-throw to let controller handle it
    }

    let tokenRefreshAttempted = false;

    while (hasMore) {
      const queryParams: any = {
        limit: limit.toString(),
        offset: offset.toString(),
      };
      
      try {
        this.logger.log('[importApprovedOffersFromSalesCenter] Fetching offers batch from Allegro API', {
          userId,
          offset,
          limit,
          approvedSetSize: approvedSet.size,
          tokenRefreshAttempted,
        });

        const response = await this.allegroApi.getOffersWithOAuthToken(oauthToken, queryParams);

        this.logger.log('[importApprovedOffersFromSalesCenter] Received response from Allegro API', {
          userId,
          offersCount: response.offers?.length || 0,
          totalCount: response.count || 0,
          offset,
        });
        const offers = response.offers || [];
        
        for (const allegroOffer of offers) {
          if (!approvedSet.has(allegroOffer.id)) {
            continue;
          }

          try {
            this.logger.log('[importApprovedOffersFromSalesCenter] Importing approved offer', {
              userId,
              offerId: allegroOffer.id,
              offerTitle: allegroOffer.name?.substring(0, 50),
              price: allegroOffer.sellingMode?.price?.amount,
              currency: allegroOffer.sellingMode?.price?.currency,
            });

            const images = this.extractImages(allegroOffer);
            const offer = await this.prisma.allegroOffer.upsert({
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
                images: images,
                rawData: allegroOffer as any,
                syncStatus: 'SYNCED',
                syncSource: 'SALES_CENTER',
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
                images: images,
                rawData: allegroOffer as any,
                syncStatus: 'SYNCED',
                syncSource: 'SALES_CENTER',
                lastSyncedAt: new Date(),
              },
            });
            // Run validation
            const validation = this.validateOfferReadiness(offer);
            await this.prisma.allegroOffer.update({
              where: { id: offer.id },
              data: {
                validationStatus: validation.status,
                validationErrors: validation.errors as any,
                lastValidatedAt: new Date(),
              },
            });
            totalImported++;
            this.logger.log('[importApprovedOffersFromSalesCenter] Successfully imported offer', {
              userId,
              offerId: allegroOffer.id,
              totalImported,
            });
          } catch (error: any) {
            this.logger.error('[importApprovedOffersFromSalesCenter] Failed to import approved offer', {
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

        this.logger.error('[importApprovedOffersFromSalesCenter] Allegro API request failed', {
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
          this.logger.warn('[importApprovedOffersFromSalesCenter] Access denied - attempting token refresh', {
            userId,
            errorStatus,
            allegroErrorCode: allegroError.code,
            allegroErrorMessage: allegroError.message || allegroError.error_description,
          });

          try {
            // Attempt to force refresh the token
            this.logger.log('[importApprovedOffersFromSalesCenter] Forcing OAuth token refresh', { userId });
            oauthToken = await this.allegroAuth.refreshUserToken(userId);
            this.logger.log('[importApprovedOffersFromSalesCenter] Token refreshed successfully, retrying API call', {
              userId,
              newTokenLength: oauthToken?.length || 0,
            });
            tokenRefreshAttempted = true;
            // Retry the same request with new token (don't increment offset)
            continue;
          } catch (refreshError: any) {
            this.logger.error('[importApprovedOffersFromSalesCenter] Failed to refresh OAuth token', {
              userId,
              refreshError: refreshError.message,
              refreshErrorStack: refreshError.stack,
            });
            throw new Error('OAuth authorization required or token expired. Failed to refresh token. Please go to Settings and re-authorize the application to access your Allegro Sales Center offers.');
          }
        } else if (errorStatus === 403 || errorStatus === 401) {
          // Already tried refresh, still getting 403/401
          const allegroError = errorData.errors?.[0] || errorData;
          this.logger.error('[importApprovedOffersFromSalesCenter] Access denied by Allegro API after token refresh - OAuth may be invalid or scopes insufficient', {
            userId,
            errorStatus,
            allegroErrorCode: allegroError.code,
            allegroErrorMessage: allegroError.message || allegroError.error_description,
            fullErrorData: JSON.stringify(errorData, null, 2),
          });
          throw new Error('OAuth authorization required or token expired. The Allegro API returned 403/401 even after token refresh. Please go to Settings and re-authorize the application to access your Allegro Sales Center offers.');
        }
        
        // Re-throw other errors
        this.logger.error('[importApprovedOffersFromSalesCenter] Unexpected error during import', {
          userId,
          errorStatus,
          errorMessage: error.message,
          errorData: JSON.stringify(errorData, null, 2),
        });
        throw error;
      }
    }

    this.logger.log('[importApprovedOffersFromSalesCenter] Finished importing approved offers', {
      userId,
      totalImported,
      requestedCount: approvedOfferIds.length,
    });
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
          const images = this.extractImages(allegroOffer);
          const offer = await this.prisma.allegroOffer.upsert({
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
              images: images,
              rawData: allegroOffer as any,
              syncStatus: 'SYNCED',
              syncSource: 'SALES_CENTER',
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
              images: images,
              rawData: allegroOffer as any,
              syncStatus: 'SYNCED',
              syncSource: 'SALES_CENTER',
              lastSyncedAt: new Date(),
            },
          });
          // Run validation
          const validation = this.validateOfferReadiness(offer);
          await this.prisma.allegroOffer.update({
            where: { id: offer.id },
            data: {
              validationStatus: validation.status,
              validationErrors: validation.errors as any,
              lastValidatedAt: new Date(),
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

  /**
   * Extract images from Allegro offer payload
   */
  private extractImages(allegroOffer: any): any {
    if (allegroOffer.images && Array.isArray(allegroOffer.images)) {
      return allegroOffer.images.map((img: any) => {
        if (typeof img === 'string') {
          return img;
        }
        return img.url || img.path || img;
      });
    }
    return null;
  }

  /**
   * Validate offer readiness for publishing
   * Returns validation status and array of errors/warnings
   */
  private validateOfferReadiness(offer: any): {
    status: 'READY' | 'WARNINGS' | 'ERRORS';
    errors: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  } {
    const errors: Array<{ type: string; message: string; severity: 'error' | 'warning' }> = [];

    // Required: Title
    if (!offer.title || offer.title.trim().length === 0) {
      errors.push({ type: 'MISSING_TITLE', message: 'Title is required', severity: 'error' });
    }

    // Required: Description
    if (!offer.description || offer.description.trim().length === 0) {
      errors.push({ type: 'MISSING_DESCRIPTION', message: 'Description is required', severity: 'error' });
    }

    // Required: At least one image
    const images = this.extractImages(offer);
    if (!images || images.length === 0) {
      errors.push({ type: 'MISSING_IMAGES', message: 'At least one image is required', severity: 'error' });
    } else if (images.length < 3) {
      errors.push({ type: 'FEW_IMAGES', message: `Only ${images.length} image(s) - consider adding more for better visibility`, severity: 'warning' });
    }

    // Required: Valid price
    const price = typeof offer.price === 'number' ? offer.price : parseFloat(offer.price || '0');
    if (!price || price <= 0) {
      errors.push({ type: 'INVALID_PRICE', message: 'Price must be greater than 0', severity: 'error' });
    }

    // Required: Valid stock
    const stock = offer.stockQuantity !== undefined ? offer.stockQuantity : offer.quantity;
    if (stock === undefined || stock < 0) {
      errors.push({ type: 'INVALID_STOCK', message: 'Stock quantity must be 0 or greater', severity: 'error' });
    } else if (stock === 0) {
      errors.push({ type: 'OUT_OF_STOCK', message: 'Stock is 0 - offer may not be visible', severity: 'warning' });
    }

    // Required: Category
    if (!offer.categoryId || offer.categoryId.trim().length === 0) {
      errors.push({ type: 'MISSING_CATEGORY', message: 'Category is required', severity: 'error' });
    }

    // Check delivery options
    if (!offer.deliveryOptions || (Array.isArray(offer.deliveryOptions) && offer.deliveryOptions.length === 0)) {
      errors.push({ type: 'MISSING_DELIVERY', message: 'At least one delivery option is recommended', severity: 'warning' });
    }

    // Check payment options
    if (!offer.paymentOptions || (Array.isArray(offer.paymentOptions) && offer.paymentOptions.length === 0)) {
      errors.push({ type: 'MISSING_PAYMENT', message: 'At least one payment option is recommended', severity: 'warning' });
    }

    // Check rawData for required attributes (if available)
    if (offer.rawData) {
      const rawData = offer.rawData;
      
      // Check if publication is active but offer has issues
      if (rawData.publication?.status === 'ACTIVE' && errors.some(e => e.severity === 'error')) {
        errors.push({ type: 'ACTIVE_WITH_ERRORS', message: 'Offer is published but has validation errors', severity: 'error' });
      }

      // Check for required parameters/attributes (category-specific requirements vary)
      if (rawData.parameters && Array.isArray(rawData.parameters)) {
        const requiredParams = rawData.parameters.filter((p: any) => p.required === true && (!p.values || p.values.length === 0));
        if (requiredParams.length > 0) {
          errors.push({
            type: 'MISSING_REQUIRED_ATTRIBUTES',
            message: `${requiredParams.length} required attribute(s) missing`,
            severity: 'error',
          });
        }
      }
    }

    // Determine overall status
    const hasErrors = errors.some(e => e.severity === 'error');
    const hasWarnings = errors.some(e => e.severity === 'warning');

    let status: 'READY' | 'WARNINGS' | 'ERRORS';
    if (hasErrors) {
      status = 'ERRORS';
    } else if (hasWarnings) {
      status = 'WARNINGS';
    } else {
      status = 'READY';
    }

    return { status, errors };
  }

  /**
   * Validate and update validation status for an offer
   */
  async validateOffer(offerId: string): Promise<{
    status: 'READY' | 'WARNINGS' | 'ERRORS';
    errors: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  }> {
    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      throw new HttpException('Offer not found', HttpStatus.NOT_FOUND);
    }

    const validation = this.validateOfferReadiness(offer);

    // Update validation status in database
    await this.prisma.allegroOffer.update({
      where: { id: offerId },
      data: {
        validationStatus: validation.status,
        validationErrors: validation.errors as any,
        lastValidatedAt: new Date(),
      },
    });

    return validation;
  }
}

