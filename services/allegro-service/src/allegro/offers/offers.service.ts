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
   * Called when user clicks "View Details" button on offers page
   * Optimized: Loads from database only (fast, no Allegro API calls)
   */
  async getOffer(id: string): Promise<any> {
    // Fast path: Load from database only (no Allegro API calls)
    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
      include: {
        product: true,
      },
    });

    if (!offer) {
      this.logger.warn('[getOffer] Offer not found', { offerId: id });
      throw new Error(`Offer with ID ${id} not found`);
    }

    // Return immediately (no logging overhead in production)
    // Logging only in development to avoid performance impact
    if (process.env.NODE_ENV === 'development') {
      this.logger.log('[getOffer] Offer fetched from database (fast path)', {
        offerId: id,
        allegroOfferId: offer.allegroOfferId,
        hasRawData: !!offer.rawData,
        hasProduct: !!offer.product,
      });
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
        syncSource: 'MANUAL',
        lastSyncedAt: new Date(),
      } as any,
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

    // Description - DO NOT include in PATCH requests
    // Allegro API's /sale/product-offers endpoint does not accept description field in PATCH requests
    // Description can only be updated via PUT with full offer data, not via PATCH
    // Completely omit description from PATCH payload to avoid 422 errors
    // if (dto.description !== undefined) {
    //   // Description updates are not supported via PATCH
    //   // This would require a full PUT request with complete offer data
    // }

    // Category - always include (required)
    if (dto.categoryId !== undefined) {
      payload.category = { id: dto.categoryId };
    } else if (existingOffer.rawData?.category?.id) {
      payload.category = { id: existingOffer.rawData.category.id };
    } else if (existingOffer.categoryId) {
      payload.category = { id: existingOffer.categoryId };
    }

    // Selling mode (price) - only include price, not other sellingMode properties
    if (dto.price !== undefined || dto.currency !== undefined) {
      payload.sellingMode = {
        price: {
          amount: String(dto.price !== undefined ? dto.price : existingOffer.price),
          currency: dto.currency || existingOffer.currency || this.getDefaultCurrency(),
        },
      };
    } else if (existingOffer.rawData?.sellingMode?.price) {
      // Only include price, not other sellingMode properties
      payload.sellingMode = {
        price: existingOffer.rawData.sellingMode.price,
      };
    }

    // Stock - only include available, not other stock properties
    if (dto.stockQuantity !== undefined || dto.quantity !== undefined) {
      const stockQty = dto.stockQuantity !== undefined ? dto.stockQuantity : dto.quantity;
      payload.stock = {
        available: stockQty,
      };
    } else if (existingOffer.rawData?.stock?.available !== undefined) {
      payload.stock = {
        available: existingOffer.rawData.stock.available,
      };
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

    // Publication status - only include status, not other publication properties
    if (dto.publicationStatus !== undefined) {
      payload.publication = {
        status: dto.publicationStatus,
      };
    } else if (existingOffer.rawData?.publication?.status) {
      payload.publication = {
        status: existingOffer.rawData.publication.status,
      };
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
   * Check if update requires Allegro API call
   * Some fields can be updated locally in database only (faster)
   */
  private requiresAllegroApiUpdate(dto: any): boolean {
    // Fields that require Allegro API update
    const allegroApiFields = [
      'title',
      'description',
      'categoryId',
      'price',
      'currency',
      'images',
      'attributes',
      'deliveryOptions',
      'paymentOptions',
    ];

    // Check if any of these fields are being updated
    return allegroApiFields.some(field => dto[field] !== undefined);
  }

  /**
   * Update offer
   * Optimized: Updates database first for fast response, then syncs to Allegro if needed
   */
  async updateOffer(id: string, dto: any, userId?: string): Promise<any> {
    this.logger.log('Updating Allegro offer', { id, fields: Object.keys(dto), userId });

    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new HttpException('Offer not found', HttpStatus.NOT_FOUND);
    }

    // Check if this is a local-only update (faster path)
    const requiresAllegroApi = this.requiresAllegroApiUpdate(dto);
    const isStockOnlyUpdate = dto.stockQuantity !== undefined && !requiresAllegroApi;
    const isLocalOnlyUpdate = !requiresAllegroApi && !isStockOnlyUpdate && (
      dto.status !== undefined ||
      dto.publicationStatus !== undefined ||
      dto.quantity !== undefined
    );

    // Fast path: Update database only for local-only fields
    if (isLocalOnlyUpdate) {
      this.logger.log('Fast path: Local-only update (database only)', {
        id,
        fields: Object.keys(dto),
      });

      const dbUpdateData: any = {
        syncStatus: 'PENDING', // Mark as pending since we're not syncing to Allegro
        lastSyncedAt: new Date(),
      };

      if (dto.status !== undefined) dbUpdateData.status = dto.status;
      if (dto.publicationStatus !== undefined) dbUpdateData.publicationStatus = dto.publicationStatus;
      if (dto.quantity !== undefined) {
        dbUpdateData.quantity = dto.quantity;
        dbUpdateData.stockQuantity = dto.quantity;
      }

      const updated = await this.prisma.allegroOffer.update({
        where: { id },
        data: dbUpdateData,
      });

      this.logger.log('Local-only update completed', { id });
      return updated;
    }

    // Stock-only update uses dedicated fast endpoint
    if (isStockOnlyUpdate) {
      this.logger.log('Fast path: Stock-only update', { id, stockQuantity: dto.stockQuantity });
      return await this.updateOfferStock(id, dto.stockQuantity, userId);
    }

    // Full update: Requires Allegro API call
    try {
      // Get user's OAuth token for updating offers (required for user-specific operations)
      let oauthToken: string;
      if (userId) {
        oauthToken = await this.getUserOAuthToken(userId);
      } else {
        // Fallback to client credentials token (may not work for all operations)
        oauthToken = await this.allegroAuth.getAccessToken();
      }

      // Skip fetching from Allegro API if we have good rawData (faster)
      // Only fetch if rawData is missing or incomplete
      let currentAllegroOffer: any = null;
      const hasGoodRawData = offer.rawData && 
        typeof offer.rawData === 'object' && 
        (offer.rawData as any).parameters && 
        Array.isArray((offer.rawData as any).parameters);

      if (!hasGoodRawData) {
        // Only fetch if rawData is missing or incomplete
        try {
          const fetchPromise = this.allegroApi.getOfferWithOAuthToken(oauthToken, offer.allegroOfferId);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout: Fetching current offer took too long')), 5000); // 5 second timeout (reduced)
          });
          currentAllegroOffer = await Promise.race([fetchPromise, timeoutPromise]) as any;
          this.logger.log('Fetched current offer from Allegro API', {
            allegroOfferId: offer.allegroOfferId,
            hasParameters: !!currentAllegroOffer?.parameters,
            parametersCount: currentAllegroOffer?.parameters?.length || 0,
          });
        } catch (error: any) {
          this.logger.warn('Failed to fetch current offer from Allegro API, using stored rawData', {
            allegroOfferId: offer.allegroOfferId,
            error: error.message,
            isTimeout: error.message?.includes('Timeout') || error.code === 'ECONNABORTED',
          });
        }
      } else {
        this.logger.log('Using stored rawData (skipping API fetch for speed)', {
          allegroOfferId: offer.allegroOfferId,
          hasParameters: !!(offer.rawData as any)?.parameters,
          parametersCount: Array.isArray((offer.rawData as any)?.parameters) ? (offer.rawData as any).parameters.length : 0,
        });
      }

      // Use current offer from API if available, otherwise use stored rawData
      const sourceOffer = currentAllegroOffer || offer.rawData || offer;

      // Transform DTO to Allegro API format
      const allegroPayload = this.transformDtoToAllegroFormat(dto, { ...offer, rawData: sourceOffer });

      // Log parameter details for debugging
      this.logger.log('Preparing Allegro API payload', {
        allegroOfferId: offer.allegroOfferId,
        payloadKeys: Object.keys(allegroPayload),
        hasParameters: !!allegroPayload.parameters,
        parametersCount: allegroPayload.parameters?.length || 0,
        parameterIds: allegroPayload.parameters?.map((p: any) => p.id) || [],
        hasCategory: !!allegroPayload.category,
        hasImages: !!allegroPayload.images,
        imagesCount: allegroPayload.images?.length || 0,
        hasDescription: !!allegroPayload.description,
        descriptionType: typeof allegroPayload.description,
        descriptionLength: typeof allegroPayload.description === 'string' ? allegroPayload.description.length : 'N/A',
        dtoHasDescription: dto.description !== undefined,
        usingOAuthToken: !!userId,
        fullPayload: JSON.stringify(allegroPayload, null, 2),
      });

      // Merge updates into rawData (before API call)
      const updatedRawData = this.mergeRawDataUpdates(offer.rawData as any, allegroPayload, dto);

      // Prepare database update data (update DB first for fast response)
      const dbUpdateData: any = {
        syncStatus: 'PENDING', // Will be updated to SYNCED after API call
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

      // Extract delivery and payment from updated rawData if not explicitly updated
      if (dto.deliveryOptions === undefined && updatedRawData?.delivery) {
        dbUpdateData.deliveryOptions = updatedRawData.delivery;
      }
      if (dto.paymentOptions === undefined && updatedRawData?.payments) {
        dbUpdateData.paymentOptions = updatedRawData.payments;
      }
      // Extract images from updated rawData if not explicitly updated
      if (dto.images === undefined && updatedRawData?.images && Array.isArray(updatedRawData.images)) {
        dbUpdateData.images = this.extractImages({ rawData: updatedRawData });
      }

      // Update rawData
      dbUpdateData.rawData = updatedRawData;

      // Log before updating database
      this.logger.log('[updateOffer] Updating offer in database with form data', {
        userId,
        offerId: id,
        allegroOfferId: offer.allegroOfferId,
        updateFields: Object.keys(dbUpdateData),
        images: {
          updating: dto.images !== undefined,
          newCount: dto.images ? dto.images.length : 0,
          newUrls: dto.images ? dto.images.map((url: string) => url.substring(0, 80)) : [],
          extractedFromRawData: dto.images === undefined && !!dbUpdateData.images,
          extractedCount: dbUpdateData.images ? (Array.isArray(dbUpdateData.images) ? dbUpdateData.images.length : 0) : 0,
        },
        description: {
          updating: dto.description !== undefined,
          newType: dto.description ? typeof dto.description : 'null',
          newLength: dto.description ? (typeof dto.description === 'string' ? dto.description.length : 'non-string') : 0,
          newPreview: dto.description && typeof dto.description === 'string' ? dto.description.substring(0, 200) : 'N/A',
        },
      });
      
      // Update in database FIRST (fast response, don't wait for Allegro API)
      const updated = await this.prisma.allegroOffer.update({
        where: { id },
        data: dbUpdateData,
      });

      // Update via Allegro API asynchronously (don't block response)
      this.logger.log('Updating offer via Allegro API (async, non-blocking)', {
        userId,
        offerId: id,
        allegroOfferId: offer.allegroOfferId,
        endpoint: `/sale/product-offers/${offer.allegroOfferId}`,
        method: 'PATCH',
        hasOAuthToken: !!oauthToken,
        payloadKeys: Object.keys(allegroPayload),
      });

      // Execute async sync with proper error handling
      // Use setImmediate to ensure it runs after the current execution context
      setImmediate(async () => {
        try {
          this.logger.log('[Async Sync] Starting Allegro API update', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            hasOAuthToken: !!oauthToken,
            oauthTokenLength: oauthToken?.length || 0,
          });
          
          if (!oauthToken) {
            throw new Error('OAuth token is missing');
          }
          
          // Retry logic for timeout errors (Allegro API can be slow)
          let lastError: any;
          const maxRetries = 2;
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              if (attempt > 0) {
                this.logger.log('[Async Sync] Retrying Allegro API update after timeout', {
                  offerId: id,
                  allegroOfferId: offer.allegroOfferId,
                  attempt: attempt + 1,
                  maxRetries: maxRetries + 1,
                });
                // Wait before retry (exponential backoff: 5s, 10s)
                await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
              }
              
              await this.allegroApi.updateOfferWithOAuthToken(oauthToken, offer.allegroOfferId, allegroPayload);
              
              // Success - break out of retry loop
              break;
            } catch (error: any) {
              lastError = error;
              const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
              
              if (isTimeout && attempt < maxRetries) {
                // Will retry
                this.logger.warn('[Async Sync] Timeout error, will retry', {
                  offerId: id,
                  allegroOfferId: offer.allegroOfferId,
                  attempt: attempt + 1,
                  error: error.message,
                });
                continue;
              } else {
                // Not a timeout or max retries reached - throw
                throw error;
              }
            }
          }
          
          this.logger.log('[Async Sync] Allegro API update successful, updating database sync status', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
          });
          
          // Update sync status on success
          await this.prisma.allegroOffer.update({
            where: { id },
            data: {
              syncStatus: 'SYNCED',
              syncError: null,
              lastSyncedAt: new Date(),
            } as any,
          });
          
          this.logger.log('[Async Sync] Offer synced to Allegro API successfully', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            syncStatus: 'SYNCED',
          });
        } catch (error: any) {
          // Update sync status on error
          this.logger.error('[Async Sync] Failed to sync offer to Allegro API', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            error: error.message,
            errorStack: error.stack,
            status: error.response?.status,
            statusText: error.response?.statusText,
            errorData: error.response?.data,
            errorCode: error.code,
          });
          
          try {
            await this.prisma.allegroOffer.update({
              where: { id },
              data: {
                syncStatus: 'ERROR',
                syncError: error.message || 'Unknown error',
              } as any,
            });
          } catch (dbError: any) {
            this.logger.error('[Async Sync] Failed to update sync error status in database', {
              offerId: id,
              error: dbError.message,
            });
          }
        }
      });
      
      // Log after updating database
      this.logger.log('[updateOffer] Offer updated in database successfully (API sync in background)', {
        userId,
        offerId: id,
        allegroOfferId: updated.allegroOfferId,
        dbImages: {
          count: Array.isArray(updated.images) ? updated.images.length : 0,
          urls: Array.isArray(updated.images) ? updated.images.map((url: string) => url.substring(0, 80)) : [],
        },
        dbDescription: {
          hasDescription: !!updated.description,
          type: updated.description ? typeof updated.description : 'null',
          length: updated.description ? (typeof updated.description === 'string' ? updated.description.length : 'non-string') : 0,
          preview: updated.description && typeof updated.description === 'string' ? updated.description.substring(0, 200) : 'N/A',
        },
        rawDataImages: {
          count: Array.isArray((updated.rawData as any)?.images) ? (updated.rawData as any).images.length : 0,
        },
        rawDataDescription: {
          hasDescription: !!(updated.rawData as any)?.description,
          type: (updated.rawData as any)?.description ? typeof (updated.rawData as any).description : 'null',
          length: (updated.rawData as any)?.description ? (typeof (updated.rawData as any).description === 'string' ? (updated.rawData as any).description.length : 'non-string') : 0,
        },
      });

      // Re-validate offer
      const validation = this.validateOfferReadiness(updated);
      await this.prisma.allegroOffer.update({
        where: { id },
        data: {
          validationStatus: validation.status,
          validationErrors: validation.errors as any,
          lastValidatedAt: new Date(),
        } as any,
      });

      this.logger.log('[updateOffer] Offer updated successfully', {
        userId,
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

    // Update in database first (fast response)
    const updated = await this.prisma.allegroOffer.update({
      where: { id },
      data: {
        stockQuantity: quantity,
        quantity,
        syncStatus: 'PENDING', // Will be updated to SYNCED after API call
        syncSource: 'MANUAL',
        lastSyncedAt: new Date(),
      } as any,
    });

    // Update via Allegro API (async, don't block response)
    this.allegroApi.updateOfferStock(offer.allegroOfferId, quantity)
      .then(() => {
        // Update sync status on success
        this.prisma.allegroOffer.update({
          where: { id },
          data: {
            syncStatus: 'SYNCED',
            syncError: null,
            lastSyncedAt: new Date(),
          } as any,
        }).catch(err => {
          this.logger.error('Failed to update sync status after stock update', { id, error: err.message });
        });
      })
      .catch((error: any) => {
        // Update sync status on error
        this.prisma.allegroOffer.update({
          where: { id },
          data: {
            syncStatus: 'ERROR',
            syncError: error.message,
          } as any,
        }).catch(err => {
          this.logger.error('Failed to update sync error status', { id, error: err.message });
        });
        this.logger.error('Failed to update stock via Allegro API', { id, error: error.message });
      });

    return updated;
  }

  /**
   * Update offer stock (with userId for OAuth)
   */
  async updateOfferStock(id: string, quantity: number, userId?: string): Promise<any> {
    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new Error(`Offer with ID ${id} not found`);
    }

    // Update in database first (fast response)
    const updated = await this.prisma.allegroOffer.update({
      where: { id },
      data: {
        stockQuantity: quantity,
        quantity,
        syncStatus: 'PENDING',
        syncSource: 'MANUAL',
        lastSyncedAt: new Date(),
      } as any,
    });

    // Update via Allegro API (async, don't block response)
    this.allegroApi.updateOfferStock(offer.allegroOfferId, quantity)
      .then(() => {
        this.prisma.allegroOffer.update({
          where: { id },
          data: {
            syncStatus: 'SYNCED',
            syncError: null,
            lastSyncedAt: new Date(),
          } as any,
        }).catch(err => {
          this.logger.error('Failed to update sync status after stock update', { id, error: err.message });
        });
      })
      .catch((error: any) => {
        this.prisma.allegroOffer.update({
          where: { id },
          data: {
            syncStatus: 'ERROR',
            syncError: error.message,
          } as any,
        }).catch(err => {
          this.logger.error('Failed to update sync error status', { id, error: err.message });
        });
        this.logger.error('Failed to update stock via Allegro API', { id, error: error.message });
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
      const offerData = this.extractOfferData(allegroOffer);
      previewOffers.push({
        ...offerData,
        // Keep raw data for reference (already included in offerData)
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

            // Fetch full offer details to ensure we have ALL fields
            // The list endpoint might return simplified data, so we fetch the complete offer
            let fullOfferData = allegroOffer;
            try {
              const fullOffer = await this.allegroApi.getOfferWithOAuthToken(oauthToken, allegroOffer.id);
              if (fullOffer) {
                fullOfferData = fullOffer;
                this.logger.log('[importApprovedOffers] Fetched full offer details', { offerId: allegroOffer.id });
              }
            } catch (fetchError: any) {
              // If fetching full details fails, use the list data
              this.logger.warn('[importApprovedOffers] Failed to fetch full offer details, using list data', {
                offerId: allegroOffer.id,
                error: fetchError.message,
              });
            }

            const offerData = this.extractOfferData(fullOfferData);
            
            // Log before saving to database
            this.logger.log('[importApprovedOffers] Saving offer to database', {
              userId,
              offerId: allegroOffer.id,
              operation: existingOffer ? 'update' : 'create',
              images: {
                count: Array.isArray(offerData.images) ? offerData.images.length : 0,
                urls: Array.isArray(offerData.images) ? offerData.images.map((url: string) => url.substring(0, 80)) : [],
              },
              description: {
                hasDescription: !!offerData.description,
                type: offerData.description ? typeof offerData.description : 'null',
                length: offerData.description ? (typeof offerData.description === 'string' ? offerData.description.length : 'non-string') : 0,
                preview: offerData.description && typeof offerData.description === 'string' ? offerData.description.substring(0, 200) : 'N/A',
              },
            });

            if (existingOffer) {
              // Update existing offer
              const updated = await this.prisma.allegroOffer.update({
                where: { allegroOfferId: allegroOffer.id },
                data: {
                  ...offerData,
                  syncStatus: 'SYNCED',
                  syncSource: 'ALLEGRO_API',
                  lastSyncedAt: new Date(),
                } as any,
              });
              
              // Log after updating
              this.logger.log('[importApprovedOffers] Offer updated in database', {
                userId,
                offerId: updated.id,
                allegroOfferId: updated.allegroOfferId,
                dbImages: {
                  count: Array.isArray(updated.images) ? updated.images.length : 0,
                  urls: Array.isArray(updated.images) ? updated.images.map((url: string) => url.substring(0, 80)) : [],
                },
                dbDescription: {
                  hasDescription: !!updated.description,
                  type: updated.description ? typeof updated.description : 'null',
                  length: updated.description ? (typeof updated.description === 'string' ? updated.description.length : 'non-string') : 0,
                  preview: updated.description && typeof updated.description === 'string' ? updated.description.substring(0, 200) : 'N/A',
                },
              });
              // Run validation
              const validation = this.validateOfferReadiness(updated);
              await this.prisma.allegroOffer.update({
                where: { allegroOfferId: allegroOffer.id },
                data: {
                  validationStatus: validation.status,
                  validationErrors: validation.errors as any,
                  lastValidatedAt: new Date(),
                } as any,
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
                  ...offerData,
                  syncStatus: 'SYNCED',
                  syncSource: 'ALLEGRO_API',
                  lastSyncedAt: new Date(),
                } as any,
              });
              
              // Log after creating
              this.logger.log('[importApprovedOffers] Offer created in database', {
                userId,
                offerId: created.id,
                allegroOfferId: created.allegroOfferId,
                dbImages: {
                  count: Array.isArray(created.images) ? created.images.length : 0,
                  urls: Array.isArray(created.images) ? created.images.map((url: string) => url.substring(0, 80)) : [],
                },
                dbDescription: {
                  hasDescription: !!created.description,
                  type: created.description ? typeof created.description : 'null',
                  length: created.description ? (typeof created.description === 'string' ? created.description.length : 'non-string') : 0,
                  preview: created.description && typeof created.description === 'string' ? created.description.substring(0, 200) : 'N/A',
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
                } as any,
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
        
        // Log after receiving data from Allegro API
        this.logger.log('[importAllOffers] Received data from Allegro API', {
          totalOffers: offers.length,
          offset,
          limit,
          responseKeys: Object.keys(response),
          responseCount: response.count,
          hasOffers: !!response.offers,
          offersIsArray: Array.isArray(response.offers),
          fullResponse: JSON.stringify(response).substring(0, 500),
        });
        
        // If no offers returned, log and exit
        if (offers.length === 0) {
          this.logger.warn('[importAllOffers] No offers returned from Allegro API', {
            offset,
            limit,
            responseCount: response.count,
            responseKeys: Object.keys(response),
            hasOffers: !!response.offers,
            fullResponse: JSON.stringify(response).substring(0, 1000),
          });
          hasMore = false;
          break;
        }
        
        for (const allegroOffer of offers) {
          try {
            // Log raw data received from Allegro API
            this.logger.log('[importAllOffers] Processing offer from Allegro API', {
              offerId: allegroOffer.id,
              title: allegroOffer.name?.substring(0, 50),
              rawDataKeys: Object.keys(allegroOffer),
              rawDataHasDescription: !!allegroOffer.description,
              rawDataDescriptionType: allegroOffer.description ? typeof allegroOffer.description : 'null',
              rawDataDescriptionLength: allegroOffer.description ? (typeof allegroOffer.description === 'string' ? allegroOffer.description.length : 'non-string') : 0,
              rawDataHasImages: !!allegroOffer.images,
              rawDataImagesCount: Array.isArray(allegroOffer.images) ? allegroOffer.images.length : 0,
              rawDataImagesUrls: Array.isArray(allegroOffer.images) ? allegroOffer.images.map((img: any) => {
                const url = typeof img === 'string' ? img : (img.url || img.path || String(img));
                return url.substring(0, 80);
              }) : [],
            });
            
            // Fetch full offer details to ensure we have ALL fields
            // The list endpoint might return simplified data, so we fetch the complete offer
            let fullOfferData = allegroOffer;
            try {
              const fullOffer = await this.allegroApi.getOfferWithOAuthToken(oauthToken, allegroOffer.id);
              if (fullOffer) {
                fullOfferData = fullOffer;
                this.logger.log('[importAllOffers] Fetched full offer details from Allegro API', {
                  offerId: allegroOffer.id,
                  fullOfferKeys: Object.keys(fullOffer),
                  fullOfferHasDescription: !!fullOffer.description,
                  fullOfferDescriptionType: fullOffer.description ? typeof fullOffer.description : 'null',
                  fullOfferDescriptionLength: fullOffer.description ? (typeof fullOffer.description === 'string' ? fullOffer.description.length : 'non-string') : 0,
                  fullOfferHasImages: !!fullOffer.images,
                  fullOfferImagesCount: Array.isArray(fullOffer.images) ? fullOffer.images.length : 0,
                  fullOfferImagesUrls: Array.isArray(fullOffer.images) ? fullOffer.images.map((img: any) => {
                    const url = typeof img === 'string' ? img : (img.url || img.path || String(img));
                    return url.substring(0, 80);
                  }) : [],
                });
              }
            } catch (fetchError: any) {
              // If fetching full details fails, use the list data
              this.logger.warn('[importAllOffers] Failed to fetch full offer details, using list data', {
                offerId: allegroOffer.id,
                error: fetchError.message,
              });
            }
            
            // Log after parsing raw data
            this.logger.log('[importAllOffers] Parsing raw data from Allegro API', {
              offerId: allegroOffer.id,
              rawDataKeys: Object.keys(fullOfferData),
              rawDataHasDescription: !!fullOfferData.description,
              rawDataDescriptionType: fullOfferData.description ? typeof fullOfferData.description : 'null',
              rawDataDescriptionLength: fullOfferData.description ? (typeof fullOfferData.description === 'string' ? fullOfferData.description.length : 'non-string') : 0,
              rawDataHasImages: !!fullOfferData.images,
              rawDataImagesCount: Array.isArray(fullOfferData.images) ? fullOfferData.images.length : 0,
              rawDataImagesUrls: Array.isArray(fullOfferData.images) ? fullOfferData.images.map((img: any) => {
                const url = typeof img === 'string' ? img : (img.url || img.path || String(img));
                return url.substring(0, 80);
              }) : [],
            });

            const offerData = this.extractOfferData(fullOfferData);
            
            // Log before saving
            this.logger.log('[importAllOffers] Saving offer to database', {
              offerId: allegroOffer.id,
              dataToSave: {
                hasDescription: !!offerData.description,
                descriptionPreview: offerData.description ? (typeof offerData.description === 'string' ? offerData.description.substring(0, 100) : 'non-string') : null,
                hasImages: !!offerData.images,
                imagesCount: Array.isArray(offerData.images) ? offerData.images.length : 0,
                hasDeliveryOptions: !!offerData.deliveryOptions,
                hasPaymentOptions: !!offerData.paymentOptions,
                hasRawData: !!offerData.rawData,
              },
            });

            // Ensure JSON fields are properly formatted for Prisma
            const dbData = {
              ...offerData,
              // Explicitly set JSON fields to ensure they're saved
              images: offerData.images ? (Array.isArray(offerData.images) ? offerData.images : [offerData.images]) : null,
              deliveryOptions: offerData.deliveryOptions || null,
              paymentOptions: offerData.paymentOptions || null,
              rawData: offerData.rawData || null,
              syncStatus: 'SYNCED',
              syncSource: 'ALLEGRO_API',
              lastSyncedAt: new Date(),
            };

            const offer = await this.prisma.allegroOffer.upsert({
              where: { allegroOfferId: allegroOffer.id },
              update: dbData as any,
              create: dbData as any,
            });

            // Log after saving to verify what was actually saved
            this.logger.log('[importAllOffers] Offer saved to database', {
              offerId: offer.allegroOfferId,
              dbId: offer.id,
              savedFields: {
                hasDescription: !!offer.description,
                descriptionLength: offer.description ? (typeof offer.description === 'string' ? offer.description.length : 'non-string') : 0,
                hasImages: !!offer.images,
                imagesCount: Array.isArray(offer.images) ? offer.images.length : (offer.images ? 1 : 0),
                hasDeliveryOptions: !!offer.deliveryOptions,
                hasPaymentOptions: !!offer.paymentOptions,
                hasRawData: !!offer.rawData,
                title: offer.title?.substring(0, 50) || 'N/A',
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
              } as any,
            });
            
            this.logger.log('[importAllOffers] Offer validation completed', {
              offerId: offer.allegroOfferId,
              validationStatus: validation.status,
              validationErrorsCount: validation.errors.length,
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

            // Fetch full offer details to ensure we have ALL fields
            // The list endpoint might return simplified data, so we fetch the complete offer
            let fullOfferData = allegroOffer;
            try {
              const fullOffer = await this.allegroApi.getOfferWithOAuthToken(oauthToken, allegroOffer.id);
              if (fullOffer) {
                fullOfferData = fullOffer;
                this.logger.log('[importApprovedOffersFromSalesCenter] Fetched full offer details', { offerId: allegroOffer.id });
              }
            } catch (fetchError: any) {
              // If fetching full details fails, use the list data
              this.logger.warn('[importApprovedOffersFromSalesCenter] Failed to fetch full offer details, using list data', {
                offerId: allegroOffer.id,
                error: fetchError.message,
              });
            }

            // Log after parsing raw data
            this.logger.log('[importApprovedOffersFromSalesCenter] Parsing raw data from Allegro API', {
              userId,
              offerId: allegroOffer.id,
              rawDataKeys: Object.keys(fullOfferData),
              rawDataHasDescription: !!fullOfferData.description,
              rawDataDescriptionType: fullOfferData.description ? typeof fullOfferData.description : 'null',
              rawDataDescriptionLength: fullOfferData.description ? (typeof fullOfferData.description === 'string' ? fullOfferData.description.length : 'non-string') : 0,
              rawDataHasImages: !!fullOfferData.images,
              rawDataImagesCount: Array.isArray(fullOfferData.images) ? fullOfferData.images.length : 0,
              rawDataImagesUrls: Array.isArray(fullOfferData.images) ? fullOfferData.images.map((img: any) => {
                const url = typeof img === 'string' ? img : (img.url || img.path || String(img));
                return url.substring(0, 80);
              }) : [],
            });
            
            const offerData = this.extractOfferData(fullOfferData);
            
            // Log after parsing - what was extracted
            this.logger.log('[importApprovedOffersFromSalesCenter] Raw data parsed successfully', {
              userId,
              offerId: allegroOffer.id,
              parsedImages: {
                count: Array.isArray(offerData.images) ? offerData.images.length : 0,
                urls: Array.isArray(offerData.images) ? offerData.images.map((url: string) => url.substring(0, 80)) : [],
              },
              parsedDescription: {
                hasDescription: !!offerData.description,
                type: offerData.description ? typeof offerData.description : 'null',
                length: offerData.description ? (typeof offerData.description === 'string' ? offerData.description.length : 'non-string') : 0,
                preview: offerData.description && typeof offerData.description === 'string' ? offerData.description.substring(0, 200) : 'N/A',
              },
            });
            
            // Log before saving to database
            this.logger.log('[importApprovedOffersFromSalesCenter] Saving parsed data to database', {
              userId,
              offerId: allegroOffer.id,
              operation: 'upsert',
              images: {
                count: Array.isArray(offerData.images) ? offerData.images.length : 0,
                urls: Array.isArray(offerData.images) ? offerData.images.map((url: string) => url.substring(0, 80)) : [],
              },
              description: {
                hasDescription: !!offerData.description,
                type: offerData.description ? typeof offerData.description : 'null',
                length: offerData.description ? (typeof offerData.description === 'string' ? offerData.description.length : 'non-string') : 0,
                preview: offerData.description && typeof offerData.description === 'string' ? offerData.description.substring(0, 200) : 'N/A',
              },
            });
            
            const offer = await this.prisma.allegroOffer.upsert({
              where: { allegroOfferId: allegroOffer.id },
              update: {
                ...offerData,
                syncStatus: 'SYNCED',
                syncSource: 'SALES_CENTER',
                lastSyncedAt: new Date(),
              } as any,
              create: {
                ...offerData,
                syncStatus: 'SYNCED',
                syncSource: 'SALES_CENTER',
                lastSyncedAt: new Date(),
              } as any,
            });
            
            // Log after saving to database
            this.logger.log('[importApprovedOffersFromSalesCenter] Data saved to database successfully', {
              userId,
              offerId: offer.id,
              allegroOfferId: offer.allegroOfferId,
              dbImages: {
                count: Array.isArray(offer.images) ? offer.images.length : 0,
                urls: Array.isArray(offer.images) ? offer.images.map((url: string) => url.substring(0, 80)) : [],
              },
              dbDescription: {
                hasDescription: !!offer.description,
                type: offer.description ? typeof offer.description : 'null',
                length: offer.description ? (typeof offer.description === 'string' ? offer.description.length : 'non-string') : 0,
                preview: offer.description && typeof offer.description === 'string' ? offer.description.substring(0, 200) : 'N/A',
              },
              rawDataImages: {
                count: Array.isArray((offer.rawData as any)?.images) ? (offer.rawData as any).images.length : 0,
              },
              rawDataDescription: {
                hasDescription: !!(offer.rawData as any)?.description,
                type: (offer.rawData as any)?.description ? typeof (offer.rawData as any).description : 'null',
                length: (offer.rawData as any)?.description ? (typeof (offer.rawData as any).description === 'string' ? (offer.rawData as any).description.length : 'non-string') : 0,
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
              } as any,
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
          const offerData = this.extractOfferData(allegroOffer);
          const offer = await this.prisma.allegroOffer.upsert({
            where: { allegroOfferId: allegroOffer.id },
            update: {
              ...offerData,
              syncStatus: 'SYNCED',
              syncSource: 'SALES_CENTER',
              lastSyncedAt: new Date(),
            } as any,
            create: {
              ...offerData,
              syncStatus: 'SYNCED',
              syncSource: 'SALES_CENTER',
              lastSyncedAt: new Date(),
            } as any,
          });
          // Run validation
          const validation = this.validateOfferReadiness(offer);
          await this.prisma.allegroOffer.update({
            where: { id: offer.id },
            data: {
              validationStatus: validation.status,
              validationErrors: validation.errors as any,
              lastValidatedAt: new Date(),
            } as any,
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
   * Extract all offer data from Allegro API response
   * Separates and normalizes all fields for database storage
   */
  private extractOfferData(allegroOffer: any): any {
    const images = this.extractImages(allegroOffer);
    const stockAvailable = allegroOffer.stock?.available || 0;
    const publicationStatus = allegroOffer.publication?.status || 'INACTIVE';
    const priceAmount = allegroOffer.sellingMode?.price?.amount || '0';
    const currency = allegroOffer.sellingMode?.price?.currency || this.getDefaultCurrency();

    // Extract description - check multiple possible locations
    // Allegro API might return description in different formats or locations
    let description = allegroOffer.description || null;
    
    // If description is an object, try to extract text from it
    if (description && typeof description === 'object') {
      // Some Allegro API responses have description as an object with sections/items
      if (description.sections && Array.isArray(description.sections)) {
        // Extract text from sections
        const textParts: string[] = [];
        description.sections.forEach((section: any) => {
          if (section.items && Array.isArray(section.items)) {
            section.items.forEach((item: any) => {
              if (item.type === 'TEXT' && item.content) {
                textParts.push(item.content);
              }
            });
          }
        });
        description = textParts.length > 0 ? textParts.join('\n\n') : null;
      } else if (description.text) {
        description = description.text;
      } else if (description.content) {
        description = description.content;
      } else {
        // If it's an object but we can't extract text, log it and set to null
        this.logger.warn('[extractOfferData] Description is object but cannot extract text', {
          offerId: allegroOffer.id,
          descriptionKeys: Object.keys(description),
        });
        description = null;
      }
    }
    
    // Ensure description is a string or null
    if (description && typeof description !== 'string') {
      description = String(description);
    }
    
    this.logger.log('[extractOfferData] Extracting description', {
      offerId: allegroOffer.id,
      hasDescription: !!description,
      descriptionType: description ? typeof description : 'null',
      descriptionLength: description ? (typeof description === 'string' ? description.length : 'non-string') : 0,
      descriptionPreview: description && typeof description === 'string' ? description.substring(0, 200) : 'N/A',
      sourceHasDescription: !!allegroOffer.description,
      sourceDescriptionType: allegroOffer.description ? typeof allegroOffer.description : 'null',
    });

    // Extract delivery options - check multiple possible locations
    let deliveryOptions = allegroOffer.delivery || allegroOffer.deliveryOptions || null;
    
    // Extract payment options - check multiple possible locations
    let paymentOptions = allegroOffer.payments || allegroOffer.paymentOptions || allegroOffer.sellingMode?.payments || null;

    const extractedData = {
      allegroOfferId: allegroOffer.id,
      allegroListingId: allegroOffer.listing?.id || allegroOffer.external?.id || null,
      title: allegroOffer.name || '',
      description: description,
      categoryId: allegroOffer.category?.id || '',
      price: parseFloat(priceAmount),
      currency: currency,
      quantity: stockAvailable,
      stockQuantity: stockAvailable,
      status: publicationStatus,
      publicationStatus: publicationStatus,
      images: images,
      deliveryOptions: deliveryOptions,
      paymentOptions: paymentOptions,
      rawData: allegroOffer as any,
    };

    // Detailed logging for field extraction
    this.logger.log('[extractOfferData] Extracted offer data', {
      offerId: allegroOffer.id,
      fields: {
        hasTitle: !!extractedData.title && extractedData.title.length > 0,
        titleLength: extractedData.title?.length || 0,
        hasDescription: !!extractedData.description,
        descriptionLength: extractedData.description ? (typeof extractedData.description === 'string' ? extractedData.description.length : 'non-string') : 0,
        hasImages: !!extractedData.images,
        imagesCount: Array.isArray(extractedData.images) ? extractedData.images.length : 0,
        hasDeliveryOptions: !!extractedData.deliveryOptions,
        deliveryOptionsType: extractedData.deliveryOptions ? typeof extractedData.deliveryOptions : 'null',
        hasPaymentOptions: !!extractedData.paymentOptions,
        paymentOptionsType: extractedData.paymentOptions ? typeof extractedData.paymentOptions : 'null',
        hasRawData: !!extractedData.rawData,
        hasCategoryId: !!extractedData.categoryId,
        hasPrice: extractedData.price > 0,
        hasStock: extractedData.stockQuantity >= 0,
        hasListingId: !!extractedData.allegroListingId,
      },
      sourceFields: {
        hasAllegroDescription: !!allegroOffer.description,
        hasAllegroImages: !!allegroOffer.images,
        hasAllegroDelivery: !!allegroOffer.delivery,
        hasAllegroDeliveryOptions: !!allegroOffer.deliveryOptions,
        hasAllegroPayments: !!allegroOffer.payments,
        hasAllegroPaymentOptions: !!allegroOffer.paymentOptions,
      },
    });

    // Log images and description summary
    this.logger.log('[extractOfferData] Images and Description summary', {
      offerId: allegroOffer.id,
      images: {
        extracted: !!extractedData.images,
        count: Array.isArray(extractedData.images) ? extractedData.images.length : 0,
        urls: Array.isArray(extractedData.images) ? extractedData.images.map((url: string) => url.substring(0, 80)) : [],
      },
      description: {
        extracted: !!extractedData.description,
        type: extractedData.description ? typeof extractedData.description : 'null',
        length: extractedData.description ? (typeof extractedData.description === 'string' ? extractedData.description.length : 'non-string') : 0,
        preview: extractedData.description && typeof extractedData.description === 'string' ? extractedData.description.substring(0, 300) : 'N/A',
      },
    });

    return extractedData;
  }

  /**
   * Extract images from Allegro offer payload
   * Checks both direct images field and rawData.images
   */
  private extractImages(allegroOffer: any): any {
    const offerId = allegroOffer.id || allegroOffer.allegroOfferId || 'unknown';
    
    // Check direct images field first
    if (allegroOffer.images && Array.isArray(allegroOffer.images)) {
      const extracted = allegroOffer.images.map((img: any, idx: number) => {
        let imageUrl: string;
        if (typeof img === 'string') {
          imageUrl = img;
        } else {
          imageUrl = img.url || img.path || String(img);
        }
        
        // Log each image extraction
        this.logger.log('[extractImages] Extracting image from direct field', {
          offerId,
          imageIndex: idx,
          imageUrl: imageUrl.substring(0, 100),
          imageUrlLength: imageUrl.length,
          sourceType: typeof img,
          hasUrl: !!img.url,
          hasPath: !!img.path,
        });
        
        return imageUrl;
      });
      
      this.logger.log('[extractImages] Successfully extracted images from direct field', {
        offerId,
        imagesCount: extracted.length,
        imageUrls: extracted.map((url: string) => url.substring(0, 80)),
        firstImagePreview: extracted[0]?.substring(0, 100) || 'N/A',
      });
      
      return extracted;
    }
    
    // Check rawData.images as fallback
    if (allegroOffer.rawData?.images && Array.isArray(allegroOffer.rawData.images)) {
      const extracted = allegroOffer.rawData.images.map((img: any, idx: number) => {
        let imageUrl: string;
        if (typeof img === 'string') {
          imageUrl = img;
        } else {
          imageUrl = img.url || img.path || String(img);
        }
        
        // Log each image extraction
        this.logger.log('[extractImages] Extracting image from rawData', {
          offerId,
          imageIndex: idx,
          imageUrl: imageUrl.substring(0, 100),
          imageUrlLength: imageUrl.length,
          sourceType: typeof img,
          hasUrl: !!img.url,
          hasPath: !!img.path,
        });
        
        return imageUrl;
      });
      
      this.logger.log('[extractImages] Successfully extracted images from rawData', {
        offerId,
        imagesCount: extracted.length,
        imageUrls: extracted.map((url: string) => url.substring(0, 80)),
        firstImagePreview: extracted[0]?.substring(0, 100) || 'N/A',
      });
      
      return extracted;
    }
    
    // Check primaryImage field (Allegro API sometimes uses this instead of images array)
    if (allegroOffer.primaryImage) {
      const url = typeof allegroOffer.primaryImage === 'string' 
        ? allegroOffer.primaryImage 
        : (allegroOffer.primaryImage.url || allegroOffer.primaryImage.path || allegroOffer.primaryImage.src);
      if (url) {
        this.logger.log('[extractImages] Found primaryImage', {
          offerId,
          imageUrl: url.substring(0, 100),
        });
        return [url];
      }
    }
    
    // Check rawData.primaryImage as fallback
    if (allegroOffer.rawData?.primaryImage) {
      const url = typeof allegroOffer.rawData.primaryImage === 'string' 
        ? allegroOffer.rawData.primaryImage 
        : (allegroOffer.rawData.primaryImage.url || allegroOffer.rawData.primaryImage.path || allegroOffer.rawData.primaryImage.src);
      if (url) {
        this.logger.log('[extractImages] Found rawData.primaryImage', {
          offerId,
          imageUrl: url.substring(0, 100),
        });
        return [url];
      }
    }
    
    this.logger.warn('[extractImages] No images found in offer', {
      offerId,
      hasDirectImages: !!allegroOffer.images,
      directImagesType: allegroOffer.images ? typeof allegroOffer.images : 'null',
      directImagesIsArray: Array.isArray(allegroOffer.images),
      hasPrimaryImage: !!allegroOffer.primaryImage,
      hasRawData: !!allegroOffer.rawData,
      hasRawDataImages: !!allegroOffer.rawData?.images,
      hasRawDataPrimaryImage: !!allegroOffer.rawData?.primaryImage,
      rawDataImagesType: allegroOffer.rawData?.images ? typeof allegroOffer.rawData.images : 'null',
      rawDataImagesIsArray: Array.isArray(allegroOffer.rawData?.images),
      rawDataKeys: allegroOffer.rawData ? Object.keys(allegroOffer.rawData).join(', ') : 'N/A',
    });
    
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

    // Required: Description - check both direct field and rawData
    const description = offer.description || (offer.rawData as any)?.description || '';
    if (!description || (typeof description === 'string' && description.trim().length === 0)) {
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

    // Check delivery options - check both direct field and rawData
    // Delivery can be an object with shippingRates array or other structure
    const deliveryOptions = offer.deliveryOptions || offer.rawData?.delivery;
    const hasDelivery = deliveryOptions && (
      (Array.isArray(deliveryOptions) && deliveryOptions.length > 0) ||
      (typeof deliveryOptions === 'object' && Object.keys(deliveryOptions).length > 0) ||
      (deliveryOptions.shippingRates && Array.isArray(deliveryOptions.shippingRates) && deliveryOptions.shippingRates.length > 0)
    );
    if (!hasDelivery) {
      errors.push({ type: 'MISSING_DELIVERY', message: 'At least one delivery option is recommended', severity: 'warning' });
    }

    // Check payment options - check both direct field and rawData
    // Payment can be an object with invoice or other structure
    const paymentOptions = offer.paymentOptions || offer.rawData?.payments;
    const hasPayment = paymentOptions && (
      (Array.isArray(paymentOptions) && paymentOptions.length > 0) ||
      (typeof paymentOptions === 'object' && Object.keys(paymentOptions).length > 0) ||
      (paymentOptions.invoice || paymentOptions.cashOnDelivery || paymentOptions.online)
    );
    if (!hasPayment) {
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
   * If offer has incomplete data, fetches fresh data from Allegro API first
   */
  async validateOffer(offerId: string, userId?: string): Promise<{
    status: 'READY' | 'WARNINGS' | 'ERRORS';
    errors: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  }> {
    let offer = await this.prisma.allegroOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      throw new HttpException('Offer not found', HttpStatus.NOT_FOUND);
    }

    // Check if offer has incomplete data (missing description, images, or rawData)
    const rawData = offer.rawData as any;
    const hasIncompleteData = !rawData || 
      !rawData.description || 
      !rawData.images || 
      (Array.isArray(rawData.images) && rawData.images.length === 0);

    // If data is incomplete and we have userId, fetch fresh data from Allegro API
    if (hasIncompleteData && userId) {
      try {
        this.logger.log('Offer has incomplete data, fetching fresh data from Allegro API', {
          offerId,
          allegroOfferId: offer.allegroOfferId,
          hasRawData: !!offer.rawData,
          hasDescription: !!(offer.rawData as any)?.description,
          hasImages: !!(offer.rawData as any)?.images,
        });

        const oauthToken = await this.getUserOAuthToken(userId);
        const fullOffer = await this.allegroApi.getOfferWithOAuthToken(oauthToken, offer.allegroOfferId);
        
        if (fullOffer) {
          // Update offer with fresh data
          const offerData = this.extractOfferData(fullOffer);
          offer = await this.prisma.allegroOffer.update({
            where: { id: offerId },
            data: {
              ...offerData,
              syncStatus: 'SYNCED',
              syncSource: 'ALLEGRO_API',
              lastSyncedAt: new Date(),
            } as any,
          });

          this.logger.log('Offer updated with fresh data from Allegro API', {
            offerId,
            allegroOfferId: offer.allegroOfferId,
            hasRawData: !!offer.rawData,
            hasDescription: !!(offer.rawData as any)?.description,
            hasImages: !!(offer.rawData as any)?.images,
          });
        }
      } catch (error: any) {
        this.logger.warn('Failed to fetch fresh data from Allegro API, validating with existing data', {
          offerId,
          error: error.message,
        });
        // Continue with existing data if fetch fails
      }
    }

    const validation = this.validateOfferReadiness(offer);

    // Update validation status in database
    await this.prisma.allegroOffer.update({
      where: { id: offerId },
      data: {
        validationStatus: validation.status,
        validationErrors: validation.errors as any,
        lastValidatedAt: new Date(),
      } as any,
    });

    return validation;
  }
}

