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
          allegroProduct: {
            include: {
              parameters: true,
            },
          },
        } as any,
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
        allegroProduct: {
          include: {
            parameters: true,
          },
        },
      } as any,
    }) as any;

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
  async createOffer(dto: any, userId?: string): Promise<any> {
    this.logger.log('Creating Allegro offer', { 
      productId: dto.productId, 
      allegroProductId: dto.allegroProductId,
      syncToAllegro: dto.syncToAllegro !== false,
    });

    // Link to AllegroProduct if allegroProductId is provided
    let allegroProductId: string | null = null;
    if (dto.allegroProductId) {
      const prismaAny = this.prisma as any;
      const product = await prismaAny.allegroProduct.findUnique({
        where: { id: dto.allegroProductId },
      });
      if (product) {
        allegroProductId = product.id;
      }
    }

    // If syncToAllegro is false, create local-only offer
    if (dto.syncToAllegro === false) {
      const offer = await this.prisma.allegroOffer.create({
        data: {
          allegroOfferId: dto.allegroOfferId || `local-${crypto.randomUUID()}`,
          productId: dto.productId || null,
          allegroProductId: allegroProductId || null,
          title: dto.title,
          description: dto.description || null,
          categoryId: dto.categoryId || null,
          price: dto.price || 0,
          quantity: dto.quantity || 0,
          stockQuantity: dto.quantity || 0,
          currency: dto.currency || this.getDefaultCurrency(),
          status: dto.status || 'ACTIVE',
          publicationStatus: dto.publicationStatus || 'INACTIVE',
          images: dto.images || null,
          syncStatus: 'PENDING',
          syncSource: 'MANUAL',
          lastSyncedAt: new Date(),
          rawData: dto.rawData || null,
        } as any,
      });

      return offer;
    }

    // Create offer via Allegro API (if syncToAllegro is true or not specified)
    let allegroOffer: any;
    try {
      allegroOffer = await this.allegroApi.createOffer(dto);
    } catch (error: any) {
      this.logger.error('Failed to create offer via Allegro API', {
        error: error.message,
        dto: { ...dto, description: dto.description?.substring(0, 100) },
      });
      throw error;
    }

    // Extract product from created offer if available
    if (allegroOffer?.productSet?.[0]?.product?.id && !allegroProductId) {
      const createdProductId = await this.upsertAllegroProductFromOffer(allegroOffer);
      if (createdProductId) {
        allegroProductId = createdProductId;
      }
    }

    // Save to database
    const offer = await this.prisma.allegroOffer.create({
      data: {
        allegroOfferId: allegroOffer.id,
        productId: dto.productId || null,
        allegroProductId: allegroProductId || null,
        title: dto.title,
        description: dto.description || null,
        categoryId: dto.categoryId,
        price: dto.price,
        quantity: dto.quantity,
        stockQuantity: dto.quantity,
        currency: allegroOffer.sellingMode?.price?.currency || dto.currency || this.getDefaultCurrency(),
        status: 'ACTIVE',
        publicationStatus: allegroOffer.publication?.status || 'INACTIVE',
        syncStatus: 'SYNCED',
        syncSource: 'MANUAL',
        lastSyncedAt: new Date(),
        rawData: allegroOffer || null,
      } as any,
    });

    return offer;
  }

  /**
   * Transform DTO to Allegro API format
   * For PATCH requests, we must include all required fields from existing offer
   * REQUIRED fields for PATCH: category, images, parameters, sellingMode, stock
   */
  private transformDtoToAllegroFormat(dto: any, existingOffer: any): any {
    const payload: any = {};
    const rawData = existingOffer.rawData || {};

    // Basic fields
    if (dto.title !== undefined) {
      payload.name = dto.title;
    } else if (rawData.name) {
      payload.name = rawData.name;
    } else if (existingOffer.title) {
      payload.name = existingOffer.title;
    }

    // Description - DO NOT include in PATCH requests
    // Allegro API's /sale/product-offers endpoint does not accept description field in PATCH requests
    // Description can only be updated via PUT with full offer data, not via PATCH
    // Completely omit description from PATCH payload to avoid 422 errors

    // Category - ALWAYS REQUIRED - must be included
    if (dto.categoryId !== undefined) {
      payload.category = { id: dto.categoryId };
    } else if (rawData.category?.id) {
      payload.category = { id: rawData.category.id };
    } else if (existingOffer.categoryId) {
      payload.category = { id: existingOffer.categoryId };
    } else {
      // If no category found, this is an error - but we'll log it and try to continue
      this.logger.warn('[transformDtoToAllegroFormat] Missing category - this may cause 422 error', {
        offerId: existingOffer.id,
        allegroOfferId: existingOffer.allegroOfferId,
      });
    }

    // Selling mode (price) - ALWAYS REQUIRED - must be included
    if (dto.price !== undefined || dto.currency !== undefined) {
      payload.sellingMode = {
        price: {
          amount: String(dto.price !== undefined ? dto.price : existingOffer.price),
          currency: dto.currency || existingOffer.currency || this.getDefaultCurrency(),
        },
      };
    } else if (rawData.sellingMode?.price) {
      payload.sellingMode = {
        price: rawData.sellingMode.price,
      };
    } else if (existingOffer.price !== undefined) {
      payload.sellingMode = {
        price: {
          amount: String(existingOffer.price),
          currency: existingOffer.currency || this.getDefaultCurrency(),
        },
      };
    } else {
      this.logger.warn('[transformDtoToAllegroFormat] Missing sellingMode - this may cause 422 error', {
        offerId: existingOffer.id,
        allegroOfferId: existingOffer.allegroOfferId,
      });
    }

    // Stock - ALWAYS REQUIRED - must be included
    if (dto.stockQuantity !== undefined || dto.quantity !== undefined) {
      const stockQty = dto.stockQuantity !== undefined ? dto.stockQuantity : dto.quantity;
      payload.stock = {
        available: stockQty,
      };
    } else if (rawData.stock?.available !== undefined) {
      payload.stock = {
        available: rawData.stock.available,
      };
    } else if (existingOffer.stockQuantity !== undefined) {
      payload.stock = {
        available: existingOffer.stockQuantity,
      };
    } else if (existingOffer.quantity !== undefined) {
      payload.stock = {
        available: existingOffer.quantity,
      };
    } else {
      // Default to 0 if not found
      payload.stock = {
        available: 0,
      };
      this.logger.warn('[transformDtoToAllegroFormat] Missing stock, defaulting to 0', {
        offerId: existingOffer.id,
        allegroOfferId: existingOffer.allegroOfferId,
      });
    }

    // Images - ALWAYS REQUIRED - must have at least one
    if (dto.images !== undefined && Array.isArray(dto.images) && dto.images.length > 0) {
      payload.images = dto.images.map((url: string) => ({ url })).filter((img: any) => img.url);
    } else if (rawData.images && Array.isArray(rawData.images) && rawData.images.length > 0) {
      payload.images = rawData.images;
    } else if (existingOffer.images && Array.isArray(existingOffer.images) && existingOffer.images.length > 0) {
      payload.images = existingOffer.images.map((img: any) => ({
        url: typeof img === 'string' ? img : img.url || img.path,
      })).filter((img: any) => img.url);
    } else {
      // Images are required - this will cause 422 if missing
      this.logger.error('[transformDtoToAllegroFormat] Missing images - this will cause 422 error', {
        offerId: existingOffer.id,
        allegroOfferId: existingOffer.allegroOfferId,
      });
    }

    // Parameters/attributes - ALWAYS REQUIRED - must be included (can be empty array)
    const existingParams = rawData.parameters || 
                          existingOffer.parameters || 
                          rawData.product?.parameters || 
                          [];
    if (dto.attributes !== undefined && Array.isArray(dto.attributes)) {
      // Update specific parameters from DTO
      const updatedParams = dto.attributes.map((attr: any) => ({
        id: String(attr.id || attr.parameterId),
        values: Array.isArray(attr.values) ? attr.values : [],
      }));
      // Keep non-updated parameters from existing offer
      const otherParams = existingParams.filter((p: any) => 
        !dto.attributes.some((a: any) => String(a.id || a.parameterId) === String(p.id || p.parameterId))
      );
      payload.parameters = [...otherParams, ...updatedParams];
    } else if (existingParams.length > 0) {
      // Include all existing parameters
      payload.parameters = existingParams.map((p: any) => ({
        id: String(p.id || p.parameterId),
        values: Array.isArray(p.values) ? p.values : [],
      }));
    } else {
      // Empty array if no parameters
      payload.parameters = [];
    }

    // Publication status - include if exists
    if (dto.publicationStatus !== undefined) {
      payload.publication = {
        status: dto.publicationStatus,
      };
    } else if (rawData.publication?.status) {
      payload.publication = {
        status: rawData.publication.status,
      };
    }

    // Delivery options - include if exists
    if (dto.deliveryOptions !== undefined) {
      payload.delivery = dto.deliveryOptions;
    } else if (rawData.delivery) {
      payload.delivery = rawData.delivery;
    }

    // Payment options - include if exists
    if (dto.paymentOptions !== undefined) {
      payload.payments = dto.paymentOptions;
    } else if (rawData.payments) {
      payload.payments = rawData.payments;
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

    const syncToAllegro = dto.syncToAllegro === true;
    const updateDto = { ...dto };
    delete updateDto.syncToAllegro;

    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new HttpException('Offer not found', HttpStatus.NOT_FOUND);
    }

    // Check if this is a local-only update (faster path)
    const requiresAllegroApi = this.requiresAllegroApiUpdate(updateDto);
    const isStockOnlyUpdate = updateDto.stockQuantity !== undefined && !requiresAllegroApi;
    const isLocalOnlyUpdate = !requiresAllegroApi && !isStockOnlyUpdate && (
      updateDto.status !== undefined ||
      updateDto.publicationStatus !== undefined ||
      updateDto.quantity !== undefined
    );

    // Fast path: Update database only for local-only fields
    if (isLocalOnlyUpdate) {
      this.logger.log('Fast path: Local-only update (database only)', {
        id,
        fields: Object.keys(updateDto),
      });

      const dbUpdateData: any = {
        syncStatus: 'PENDING', // Mark as pending since we're not syncing to Allegro
        lastSyncedAt: new Date(),
      };

      if (updateDto.status !== undefined) dbUpdateData.status = updateDto.status;
      if (updateDto.publicationStatus !== undefined) dbUpdateData.publicationStatus = updateDto.publicationStatus;
      if (updateDto.quantity !== undefined) {
        dbUpdateData.quantity = updateDto.quantity;
        dbUpdateData.stockQuantity = updateDto.quantity;
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
      this.logger.log('Fast path: Stock-only update', { id, stockQuantity: updateDto.stockQuantity });
      return await this.updateOfferStock(id, updateDto.stockQuantity, userId);
    }

    // Full update: Requires Allegro API call (optional)
    try {
      let oauthToken: string | undefined;
      let currentAllegroOffer: any = null;

      if (syncToAllegro) {
        // Get user's OAuth token for updating offers (required for user-specific operations)
        if (userId) {
          oauthToken = await this.getUserOAuthToken(userId);
        } else {
          // Fallback to client credentials token (may not work for all operations)
          oauthToken = await this.allegroAuth.getAccessToken();
        }

        // Skip fetching from Allegro API if we have good rawData (faster)
        // Only fetch if rawData is missing or incomplete
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
      }

      // Use current offer from API if available, otherwise use stored rawData
      const sourceOffer = currentAllegroOffer || offer.rawData || offer;

      // Transform DTO to Allegro API format
      const allegroPayload = this.transformDtoToAllegroFormat(updateDto, { ...offer, rawData: sourceOffer });

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
        dtoHasDescription: updateDto.description !== undefined,
        usingOAuthToken: !!userId,
        fullPayload: JSON.stringify(allegroPayload, null, 2),
      });

      // Merge updates into rawData (before API call)
      const updatedRawData = this.mergeRawDataUpdates(offer.rawData as any, allegroPayload, updateDto);

      // Prepare database update data (update DB first for fast response)
      const dbUpdateData: any = {
        syncStatus: 'PENDING', // Will be updated to SYNCED after API call
        syncSource: 'MANUAL',
        lastSyncedAt: new Date(),
        syncError: null,
      };

      // Update fields that changed
      if (updateDto.title !== undefined) dbUpdateData.title = updateDto.title;
      if (updateDto.description !== undefined) dbUpdateData.description = updateDto.description;
      if (updateDto.categoryId !== undefined) dbUpdateData.categoryId = updateDto.categoryId;
      if (updateDto.price !== undefined) dbUpdateData.price = updateDto.price;
      if (updateDto.currency !== undefined) dbUpdateData.currency = updateDto.currency;
      if (updateDto.stockQuantity !== undefined) {
        dbUpdateData.stockQuantity = updateDto.stockQuantity;
        dbUpdateData.quantity = updateDto.stockQuantity;
      } else if (updateDto.quantity !== undefined) {
        dbUpdateData.quantity = updateDto.quantity;
        dbUpdateData.stockQuantity = updateDto.quantity;
      }
      if (updateDto.images !== undefined) dbUpdateData.images = updateDto.images;
      if (updateDto.status !== undefined) dbUpdateData.status = updateDto.status;
      if (updateDto.publicationStatus !== undefined) dbUpdateData.publicationStatus = updateDto.publicationStatus;
      if (updateDto.deliveryOptions !== undefined) dbUpdateData.deliveryOptions = updateDto.deliveryOptions;
      if (updateDto.paymentOptions !== undefined) dbUpdateData.paymentOptions = updateDto.paymentOptions;

      // Extract delivery and payment from updated rawData if not explicitly updated
      if (updateDto.deliveryOptions === undefined && updatedRawData?.delivery) {
        dbUpdateData.deliveryOptions = updatedRawData.delivery;
      }
      if (updateDto.paymentOptions === undefined && updatedRawData?.payments) {
        dbUpdateData.paymentOptions = updatedRawData.payments;
      }
      // Extract images from updated rawData if not explicitly updated
      if (updateDto.images === undefined && updatedRawData?.images && Array.isArray(updatedRawData.images)) {
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
          updating: updateDto.images !== undefined,
          newCount: updateDto.images ? updateDto.images.length : 0,
          newUrls: updateDto.images ? updateDto.images.map((url: string) => url.substring(0, 80)) : [],
          extractedFromRawData: updateDto.images === undefined && !!dbUpdateData.images,
          extractedCount: dbUpdateData.images ? (Array.isArray(dbUpdateData.images) ? dbUpdateData.images.length : 0) : 0,
        },
        description: {
          updating: updateDto.description !== undefined,
          newType: updateDto.description ? typeof updateDto.description : 'null',
          newLength: updateDto.description ? (typeof updateDto.description === 'string' ? updateDto.description.length : 'non-string') : 0,
          newPreview: updateDto.description && typeof updateDto.description === 'string' ? updateDto.description.substring(0, 200) : 'N/A',
        },
      });
      
      // Update in database FIRST (fast response, don't wait for Allegro API)
      const updated = await this.prisma.allegroOffer.update({
        where: { id },
        data: dbUpdateData,
      });

      if (!syncToAllegro) {
        this.logger.log('[updateOffer] Skipping Allegro API sync (syncToAllegro=false)', {
          offerId: id,
          allegroOfferId: offer.allegroOfferId,
          updateFields: Object.keys(dbUpdateData),
        });
        return updated;
      }

      // Update via Allegro API asynchronously (don't block response)
      this.logger.log('[updateOffer] Updating offer via Allegro API (async, non-blocking)', {
        userId,
        offerId: id,
        allegroOfferId: offer.allegroOfferId,
        endpoint: `/sale/product-offers/${offer.allegroOfferId}`,
        method: 'PATCH',
        hasOAuthToken: !!oauthToken,
        oauthTokenLength: oauthToken?.length || 0,
        oauthTokenPreview: oauthToken ? `${oauthToken.substring(0, 20)}...` : 'null',
        payloadKeys: Object.keys(allegroPayload),
        payloadSize: JSON.stringify(allegroPayload).length,
        timestamp: new Date().toISOString(),
      });

      // Execute async sync with proper error handling
      // Use setImmediate to ensure it runs after the current execution context
      this.logger.log('[Async Sync] STEP 1: Scheduling async sync job with setImmediate', {
        offerId: id,
        allegroOfferId: offer.allegroOfferId,
        hasOAuthToken: !!oauthToken,
        timestamp: new Date().toISOString(),
        stackTrace: new Error().stack?.split('\n').slice(0, 5).join(' | '),
      });
      
      const asyncSyncStartTime = Date.now();
      setImmediate(async () => {
        const asyncSyncExecutionTime = Date.now() - asyncSyncStartTime;
        this.logger.log('[Async Sync] STEP 2: setImmediate callback executed', {
          offerId: id,
          allegroOfferId: offer.allegroOfferId,
          timeSinceScheduling: `${asyncSyncExecutionTime}ms`,
          timestamp: new Date().toISOString(),
        });
        
        try {
          this.logger.log('[Async Sync] STEP 3: Starting Allegro API update', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            hasOAuthToken: !!oauthToken,
            oauthTokenLength: oauthToken?.length || 0,
            oauthTokenPreview: oauthToken ? `${oauthToken.substring(0, 20)}...` : 'null',
            timestamp: new Date().toISOString(),
          });
          
          if (!oauthToken) {
            this.logger.error('[Async Sync] STEP 3.1: OAuth token validation failed', {
              offerId: id,
              allegroOfferId: offer.allegroOfferId,
              oauthToken: oauthToken,
              timestamp: new Date().toISOString(),
            });
            throw new Error('OAuth token is missing');
          }
          
          this.logger.log('[Async Sync] STEP 3.2: OAuth token validated, starting retry loop', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            maxRetries: 2,
            timestamp: new Date().toISOString(),
          });
          
          // Retry logic for timeout errors (Allegro API can be slow)
          let lastError: any;
          const maxRetries = 2;
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const attemptStartTime = Date.now();
            this.logger.log('[Async Sync] STEP 4: Attempting Allegro API call', {
              offerId: id,
              allegroOfferId: offer.allegroOfferId,
              attempt: attempt + 1,
              maxAttempts: maxRetries + 1,
              timestamp: new Date().toISOString(),
            });
            
            try {
              if (attempt > 0) {
                this.logger.log('[Async Sync] STEP 4.1: Retrying Allegro API update after timeout', {
                  offerId: id,
                  allegroOfferId: offer.allegroOfferId,
                  attempt: attempt + 1,
                  maxRetries: maxRetries + 1,
                  waitTime: `${5000 * attempt}ms`,
                  timestamp: new Date().toISOString(),
                });
                // Wait before retry (exponential backoff: 5s, 10s)
                await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
                this.logger.log('[Async Sync] STEP 4.2: Wait completed, proceeding with retry', {
                  offerId: id,
                  allegroOfferId: offer.allegroOfferId,
                  attempt: attempt + 1,
                  timestamp: new Date().toISOString(),
                });
              }
              
              this.logger.log('[Async Sync] STEP 5: Calling updateOfferWithOAuthToken', {
                offerId: id,
                allegroOfferId: offer.allegroOfferId,
                attempt: attempt + 1,
                url: `${this.allegroApi['apiUrl']}/sale/product-offers/${offer.allegroOfferId}`,
                payloadSize: JSON.stringify(allegroPayload).length,
                timestamp: new Date().toISOString(),
              });
              
              const apiCallStartTime = Date.now();
              await this.allegroApi.updateOfferWithOAuthToken(oauthToken, offer.allegroOfferId, allegroPayload);
              const apiCallDuration = Date.now() - apiCallStartTime;
              
              this.logger.log('[Async Sync] STEP 6: Allegro API call successful', {
                offerId: id,
                allegroOfferId: offer.allegroOfferId,
                attempt: attempt + 1,
                duration: `${apiCallDuration}ms`,
                timestamp: new Date().toISOString(),
              });
              
              // Success - break out of retry loop
              break;
            } catch (error: any) {
              const attemptDuration = Date.now() - attemptStartTime;
              lastError = error;
              const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
              
              this.logger.error('[Async Sync] STEP 7: Allegro API call failed', {
                offerId: id,
                allegroOfferId: offer.allegroOfferId,
                attempt: attempt + 1,
                duration: `${attemptDuration}ms`,
                error: error.message,
                errorCode: error.code,
                errorStatus: error.response?.status,
                errorStatusText: error.response?.statusText,
                errorData: error.response?.data,
                isTimeout: isTimeout,
                willRetry: isTimeout && attempt < maxRetries,
                timestamp: new Date().toISOString(),
              });
              
              if (isTimeout && attempt < maxRetries) {
                // Will retry
                this.logger.warn('[Async Sync] STEP 7.1: Timeout error, will retry', {
                  offerId: id,
                  allegroOfferId: offer.allegroOfferId,
                  attempt: attempt + 1,
                  nextAttempt: attempt + 2,
                  error: error.message,
                  timestamp: new Date().toISOString(),
                });
                continue;
              } else {
                // Not a timeout or max retries reached - throw
                this.logger.error('[Async Sync] STEP 7.2: Max retries reached or non-timeout error, throwing', {
                  offerId: id,
                  allegroOfferId: offer.allegroOfferId,
                  attempt: attempt + 1,
                  maxRetries: maxRetries + 1,
                  isTimeout: isTimeout,
                  error: error.message,
                  timestamp: new Date().toISOString(),
                });
                throw error;
              }
            }
          }
          
          this.logger.log('[Async Sync] STEP 8: Allegro API update successful, updating database sync status', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            timestamp: new Date().toISOString(),
          });
          
          // Update sync status on success
          const dbUpdateStartTime = Date.now();
          await this.prisma.allegroOffer.update({
            where: { id },
            data: {
              syncStatus: 'SYNCED',
              syncError: null,
              lastSyncedAt: new Date(),
            } as any,
          });
          const dbUpdateDuration = Date.now() - dbUpdateStartTime;
          
          this.logger.log('[Async Sync] STEP 9: Database sync status updated successfully', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            syncStatus: 'SYNCED',
            dbUpdateDuration: `${dbUpdateDuration}ms`,
            timestamp: new Date().toISOString(),
          });
          
          this.logger.log('[Async Sync] STEP 10: Offer synced to Allegro API successfully - COMPLETE', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            syncStatus: 'SYNCED',
            totalDuration: `${Date.now() - asyncSyncStartTime}ms`,
            timestamp: new Date().toISOString(),
          });
        } catch (error: any) {
          // Update sync status on error
          this.logger.error('[Async Sync] STEP ERROR: Failed to sync offer to Allegro API', {
            offerId: id,
            allegroOfferId: offer.allegroOfferId,
            error: error.message,
            errorName: error.name,
            errorCode: error.code,
            errorStack: error.stack,
            status: error.response?.status,
            statusText: error.response?.statusText,
            errorData: error.response?.data,
            errorHeaders: error.response?.headers,
            totalDuration: `${Date.now() - asyncSyncStartTime}ms`,
            timestamp: new Date().toISOString(),
          });
          
          try {
            this.logger.log('[Async Sync] STEP ERROR.1: Updating database with ERROR status', {
              offerId: id,
              allegroOfferId: offer.allegroOfferId,
              syncError: error.message || 'Unknown error',
              timestamp: new Date().toISOString(),
            });
            
            const dbErrorUpdateStartTime = Date.now();
            await this.prisma.allegroOffer.update({
              where: { id },
              data: {
                syncStatus: 'ERROR',
                syncError: error.message || 'Unknown error',
              } as any,
            });
            const dbErrorUpdateDuration = Date.now() - dbErrorUpdateStartTime;
            
            this.logger.log('[Async Sync] STEP ERROR.2: Database updated with ERROR status', {
              offerId: id,
              allegroOfferId: offer.allegroOfferId,
              syncStatus: 'ERROR',
              dbUpdateDuration: `${dbErrorUpdateDuration}ms`,
              timestamp: new Date().toISOString(),
            });
          } catch (dbError: any) {
            this.logger.error('[Async Sync] STEP ERROR.3: Failed to update sync error status in database', {
              offerId: id,
              allegroOfferId: offer.allegroOfferId,
              dbError: dbError.message,
              dbErrorStack: dbError.stack,
              originalError: error.message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      });
      
      this.logger.log('[Async Sync] STEP 0: setImmediate scheduled, returning control to caller', {
        offerId: id,
        allegroOfferId: offer.allegroOfferId,
        timestamp: new Date().toISOString(),
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
      const offerData = this.sanitizeOfferDataForPrisma(this.extractOfferData(allegroOffer));
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

            const allegroProductId = await this.upsertAllegroProductFromOffer(fullOfferData, oauthToken);
            const offerData = this.sanitizeOfferDataForPrisma(this.extractOfferData(fullOfferData));
            
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
                  ...(allegroProductId ? { allegroProductId } : {}),
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
                  ...(allegroProductId ? { allegroProductId } : {}),
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

            const allegroProductId = await this.upsertAllegroProductFromOffer(fullOfferData, oauthToken);
            const offerData = this.sanitizeOfferDataForPrisma(this.extractOfferData(fullOfferData));
            
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
              ...(allegroProductId ? { allegroProductId } : {}),
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
            
            const allegroProductId = await this.upsertAllegroProductFromOffer(fullOfferData, oauthToken);
            const offerData = this.sanitizeOfferDataForPrisma(this.extractOfferData(fullOfferData));
            
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
                ...(allegroProductId ? { allegroProductId } : {}),
                syncStatus: 'SYNCED',
                syncSource: 'SALES_CENTER',
                lastSyncedAt: new Date(),
              } as any,
              create: {
                ...offerData,
                ...(allegroProductId ? { allegroProductId } : {}),
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
      
      // Get OAuth token for API calls
      let oauthToken: string | undefined;
      try {
        oauthToken = await this.allegroAuth.getUserAccessToken(userId);
      } catch (tokenError: any) {
        this.logger.error('Failed to get OAuth token for Sales Center import', {
          userId,
          error: tokenError.message,
        });
        throw new Error('OAuth authorization required. Please authorize the application in Settings to access your Allegro offers.');
      }
      
      let response;
      try {
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
          const allegroProductId = await this.upsertAllegroProductFromOffer(allegroOffer, oauthToken);
          const offerData = this.sanitizeOfferDataForPrisma(this.extractOfferData(allegroOffer));
          const offer = await this.prisma.allegroOffer.upsert({
            where: { allegroOfferId: allegroOffer.id },
            update: {
              ...offerData,
              ...(allegroProductId ? { allegroProductId } : {}),
              syncStatus: 'SYNCED',
              syncSource: 'SALES_CENTER',
              lastSyncedAt: new Date(),
            } as any,
            create: {
              ...offerData,
              ...(allegroProductId ? { allegroProductId } : {}),
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
   * Extract human-readable error message from Allegro API error response
   * Handles various error formats from Allegro API
   */
  private extractErrorMessage(error: any): string {
    try {
      const errorData = error.response?.data || error.data || {};
      const statusCode = error.response?.status || error.status;

      // Try multiple error message locations
      // 1. errors array with message property
      if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        const firstError = errorData.errors[0];
        if (typeof firstError === 'string') {
          return firstError;
        }
        if (typeof firstError === 'object') {
          // Try various message properties
          if (firstError.message) return String(firstError.message);
          if (firstError.userMessage) return String(firstError.userMessage);
          if (firstError.detail) return String(firstError.detail);
          if (firstError.code) return `${firstError.code}: ${firstError.userMessage || firstError.message || 'Unknown error'}`;
          // If error object has keys, try to stringify meaningful parts
          const keys = Object.keys(firstError);
          if (keys.length > 0) {
            const meaningfulValue = firstError[keys[0]];
            if (typeof meaningfulValue === 'string' && meaningfulValue.length < 200) {
              return meaningfulValue;
            }
          }
        }
      }

      // 2. Direct message property
      if (errorData.message) {
        return String(errorData.message);
      }

      // 3. error_description (OAuth errors)
      if (errorData.error_description) {
        return String(errorData.error_description);
      }

      // 4. error property
      if (errorData.error) {
        const errorValue = errorData.error;
        if (typeof errorValue === 'string') {
          return errorValue;
        }
        if (typeof errorValue === 'object' && errorValue.message) {
          return String(errorValue.message);
        }
      }

      // 5. violations array (validation errors)
      if (errorData.violations && Array.isArray(errorData.violations) && errorData.violations.length > 0) {
        const violation = errorData.violations[0];
        if (violation.message) return String(violation.message);
        if (violation.path && violation.message) {
          return `${violation.path}: ${violation.message}`;
        }
      }

      // 6. Standard error message
      if (error.message) {
        // Check if it's a generic error that we can improve
        if (error.message === 'Request failed with status code' && statusCode) {
          return `Request failed with status code ${statusCode}`;
        }
        return String(error.message);
      }

      // 7. Status code based messages
      if (statusCode) {
        if (statusCode === 401 || statusCode === 403) {
          return 'OAuth authorization required or token expired. Please re-authorize in Settings.';
        }
        if (statusCode === 404) {
          return 'Resource not found. The offer or product may have been deleted.';
        }
        if (statusCode === 422) {
          return 'Validation error. Please check offer data (images, category, required fields).';
        }
        if (statusCode === 429) {
          return 'Rate limit exceeded. Please try again later.';
        }
        return `Request failed with status code ${statusCode}`;
      }

      // 8. Last resort - try to stringify errorData if it's small
      try {
        const errorStr = JSON.stringify(errorData);
        if (errorStr && errorStr.length < 200 && errorStr !== '{}') {
          return errorStr;
        }
      } catch (e) {
        // Ignore JSON stringify errors
      }

      return 'Unknown error occurred. Please check logs for details.';
    } catch (extractError: any) {
      // If error extraction itself fails, return a safe message
      this.logger.error('[extractErrorMessage] Failed to extract error message', {
        originalError: error.message,
        extractError: extractError.message,
      });
      return error.message || 'Failed to parse error message';
    }
  }

  /**
   * Strip fields not present in Prisma schema to avoid unknown argument errors
   */
  private sanitizeOfferDataForPrisma(data: any): any {
    const { publicUrl, ...rest } = data || {};
    return rest;
  }

  /**
   * Upsert Allegro product (raw productSet) and normalized parameters
   */
  private async upsertAllegroProductFromOffer(allegroOffer: any, oauthToken?: string): Promise<string | null> {
    try {
      const productSet = Array.isArray(allegroOffer?.productSet) && allegroOffer.productSet.length > 0
        ? allegroOffer.productSet[0]
        : null;
      const product = productSet?.product;
      if (!product || !product.id) {
        return null;
      }

      let productDetails = product;

      // If name/parameters are missing, try to fetch product details from Allegro API
      if ((!product?.name || !product?.parameters || product.parameters.length === 0) && oauthToken) {
        try {
          const detailed = await this.allegroApi.getProductWithOAuthToken(oauthToken, String(product.id));
          if (detailed) {
            productDetails = {
              ...product,
              ...detailed,
              parameters: detailed.parameters || product.parameters,
            };
          }
        } catch (fetchError: any) {
          this.logger.warn('[upsertAllegroProductFromOffer] Failed to fetch product details', {
            productId: product.id,
            error: fetchError.message,
          });
        }
      }

      const parameters = Array.isArray(productDetails?.parameters) ? productDetails.parameters : [];
      const findParamValue = (match: (param: any) => boolean): string | null => {
        const param = parameters.find(match);
        if (!param) return null;
        if (Array.isArray(param.values) && param.values.length > 0) {
          const first = param.values[0] as any;
          return typeof first === 'string' ? first : (first?.name || null);
        }
        if (typeof param.value === 'string') return param.value;
        return null;
      };

      const brand = findParamValue((p) => String(p.id) === '248811' || p.name === 'Značka') || productDetails.brand || null;
      const manufacturerCode = findParamValue((p) => String(p.id) === '224017' || p.name === 'Kód výrobce') || productDetails.manufacturerCode || null;
      const ean = findParamValue((p) => String(p.id) === '225693' || p.name === 'EAN (GTIN)') || productDetails.ean || null;
      const publicationStatus = productDetails.publication?.status || null;
      const marketedBeforeGPSR = productSet?.marketedBeforeGPSRObligation ?? null;
      const isAiCoCreated = !!productDetails.isAiCoCreated;

      const baseData = {
        allegroProductId: String(productDetails.id),
        name: productDetails.name || null,
        brand,
        manufacturerCode,
        ean,
        publicationStatus,
        isAiCoCreated,
        marketedBeforeGPSR,
        rawData: productSet,
      };

      const prismaAny = this.prisma as any;

      const allegroProduct = await prismaAny.allegroProduct.upsert({
        where: { allegroProductId: String(product.id) },
        update: baseData as any,
        create: baseData as any,
      });

      if (parameters.length > 0) {
        await prismaAny.allegroProductParameter.deleteMany({
          where: { allegroProductId: allegroProduct.id },
        });

        const paramsData = parameters.map((param: any, index: number) => {
          const parameterId = param.id ? String(param.id) : (param.name ? `name:${param.name}` : `idx:${index}`);
          return {
            allegroProductId: allegroProduct.id,
            parameterId,
            name: param.name || null,
            values: param.values || null,
            valuesIds: param.valuesIds || null,
            rangeValue: param.rangeValue || null,
          };
        });

        await prismaAny.allegroProductParameter.createMany({
          data: paramsData as any,
          skipDuplicates: true,
        });
      }

      return allegroProduct.id;
    } catch (error: any) {
      this.logger.error('[upsertAllegroProductFromOffer] Failed to upsert Allegro product', {
        error: error.message,
        offerId: allegroOffer?.id,
      });
      return null;
    }
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
   * Pull latest data from Allegro into our database
   */
  async syncOfferFromAllegro(offerId: string, userId?: string): Promise<any> {
    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      throw new HttpException('Offer not found', HttpStatus.NOT_FOUND);
    }

    if (!userId) {
      throw new HttpException('User id is required for Allegro sync', HttpStatus.BAD_REQUEST);
    }

    const oauthToken = await this.getUserOAuthToken(userId);
    this.logger.log('[syncOfferFromAllegro] Got OAuth token, fetching offer', {
      offerId,
      allegroOfferId: offer.allegroOfferId,
      timeoutMs: 10000,
    });
    const fullOffer = await this.allegroApi.getOfferWithOAuthToken(oauthToken, offer.allegroOfferId);
    this.logger.log('[syncOfferFromAllegro] Offer fetched from Allegro', {
      offerId,
      allegroOfferId: offer.allegroOfferId,
      hasName: !!fullOffer?.name,
      hasImages: Array.isArray(fullOffer?.images) ? fullOffer.images.length : 0,
    });

    if (!fullOffer) {
      throw new HttpException('Failed to fetch offer from Allegro', HttpStatus.BAD_GATEWAY);
    }

    const offerData = this.sanitizeOfferDataForPrisma(this.extractOfferData(fullOffer));
    this.logger.log('[syncOfferFromAllegro] Offer data extracted', {
      offerId,
      allegroOfferId: offer.allegroOfferId,
      extractedKeys: Object.keys(offerData),
      hasRawData: !!offerData.rawData,
      imagesCount: Array.isArray(offerData.images) ? offerData.images.length : 0,
      descriptionLen: offerData.description ? String(offerData.description).length : 0,
    });
    const updated = await this.prisma.allegroOffer.update({
      where: { id: offerId },
      data: {
        ...offerData,
        syncStatus: 'SYNCED',
        syncSource: 'ALLEGRO_API',
        lastSyncedAt: new Date(),
      } as any,
    });

    const validation = this.validateOfferReadiness(updated);
    this.logger.log('[syncOfferFromAllegro] Validation result', {
      offerId,
      allegroOfferId: offer.allegroOfferId,
      status: validation.status,
      errorCount: validation.errors.filter(e => e.severity === 'error').length,
      warningCount: validation.errors.filter(e => e.severity === 'warning').length,
    });
    return await this.prisma.allegroOffer.update({
      where: { id: offerId },
      data: {
        validationStatus: validation.status,
        validationErrors: validation.errors as any,
        lastValidatedAt: new Date(),
      } as any,
    });
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
          const offerData = this.sanitizeOfferDataForPrisma(this.extractOfferData(fullOffer));
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

  /**
   * Search for product on Allegro catalog
   * Searches by EAN first, then manufacturer code, then product name
   * Returns Allegro product ID if found, null if not found
   */
  private async searchProductOnAllegro(oauthToken: string, offer: any): Promise<string | null> {
    try {
      // Extract identifiers from offer
      const ean = offer.product?.ean || offer.allegroProduct?.ean || (offer.rawData as any)?.ean || null;
      const manufacturerCode = offer.product?.manufacturerCode || offer.allegroProduct?.manufacturerCode || null;
      const productName = offer.product?.name || offer.allegroProduct?.name || offer.title || null;

      // Search by EAN first (most reliable)
      if (ean) {
        try {
          this.logger.log('[searchProductOnAllegro] Searching by EAN', { ean, offerId: offer.id });
          const result = await this.allegroApi.searchProductsWithOAuthToken(oauthToken, { ean });
          if (result?.products && Array.isArray(result.products) && result.products.length > 0) {
            const productId = result.products[0]?.id;
            if (productId) {
              this.logger.log('[searchProductOnAllegro] Product found by EAN', { ean, productId, offerId: offer.id });
              return String(productId);
            }
          }
        } catch (error: any) {
          this.logger.warn('[searchProductOnAllegro] EAN search failed', {
            ean,
            error: error.message,
            offerId: offer.id,
          });
        }
      }

      // Fallback to manufacturer code
      if (manufacturerCode) {
        try {
          this.logger.log('[searchProductOnAllegro] Searching by manufacturer code', {
            manufacturerCode,
            offerId: offer.id,
          });
          const result = await this.allegroApi.searchProductsWithOAuthToken(oauthToken, {
            manufacturerCode,
          });
          if (result?.products && Array.isArray(result.products) && result.products.length > 0) {
            const productId = result.products[0]?.id;
            if (productId) {
              this.logger.log('[searchProductOnAllegro] Product found by manufacturer code', {
                manufacturerCode,
                productId,
                offerId: offer.id,
              });
              return String(productId);
            }
          }
        } catch (error: any) {
          this.logger.warn('[searchProductOnAllegro] Manufacturer code search failed', {
            manufacturerCode,
            error: error.message,
            offerId: offer.id,
          });
        }
      }

      // Fallback to product name (less precise)
      if (productName) {
        try {
          this.logger.log('[searchProductOnAllegro] Searching by product name', {
            productName,
            offerId: offer.id,
          });
          const result = await this.allegroApi.searchProductsWithOAuthToken(oauthToken, {
            name: productName,
          });
          if (result?.products && Array.isArray(result.products) && result.products.length > 0) {
            // Try to match by name similarity
            const matched = result.products.find((p: any) =>
              p.name?.toLowerCase() === productName.toLowerCase(),
            );
            const productId = matched?.id || result.products[0]?.id;
            if (productId) {
              this.logger.log('[searchProductOnAllegro] Product found by name', {
                productName,
                productId,
                offerId: offer.id,
              });
              return String(productId);
            }
          }
        } catch (error: any) {
          this.logger.warn('[searchProductOnAllegro] Product name search failed', {
            productName,
            error: error.message,
            offerId: offer.id,
          });
        }
      }

      this.logger.log('[searchProductOnAllegro] Product not found', {
        offerId: offer.id,
        hasEAN: !!ean,
        hasManufacturerCode: !!manufacturerCode,
        hasProductName: !!productName,
      });
      return null;
    } catch (error: any) {
      this.logger.error('[searchProductOnAllegro] Failed to search product', {
        error: error.message,
        offerId: offer.id,
      });
      return null;
    }
  }

  /**
   * Create product on Allegro catalog
   * Extracts product data from offer and creates product with required fields
   * Returns Allegro product ID
   */
  private async createProductOnAllegro(oauthToken: string, offer: any): Promise<string> {
    try {
      // Extract product data from offer
      const productName = offer.product?.name || offer.allegroProduct?.name || offer.title || 'Product';
      const brand =
        offer.product?.brand ||
        offer.allegroProduct?.brand ||
        (offer.rawData as any)?.parameters?.find((p: any) => p.id === '248811' || p.name === 'Značka')?.values?.[0] ||
        null;
      const manufacturerCode =
        offer.product?.manufacturerCode ||
        offer.allegroProduct?.manufacturerCode ||
        (offer.rawData as any)?.parameters?.find((p: any) => p.id === '224017' || p.name === 'Kód výrobce')
          ?.values?.[0] ||
        null;
      const ean =
        offer.product?.ean ||
        offer.allegroProduct?.ean ||
        (offer.rawData as any)?.parameters?.find((p: any) => p.id === '225693' || p.name === 'EAN (GTIN)')
          ?.values?.[0] ||
        null;
      const categoryId = offer.categoryId || (offer.rawData as any)?.category?.id || null;

      // Extract parameters from offer
      const parameters =
        (offer.rawData as any)?.parameters ||
        offer.allegroProduct?.parameters?.map((p: any) => ({
          id: p.parameterId,
          name: p.name,
          values: p.values,
          valuesIds: p.valuesIds,
          rangeValue: p.rangeValue,
        })) ||
        [];

      // Build product payload
      const productPayload: any = {
        name: productName,
        category: categoryId ? { id: categoryId } : null,
        parameters: parameters.map((p: any) => ({
          id: String(p.id || p.parameterId),
          values: Array.isArray(p.values) ? p.values : p.valuesIds ? p.valuesIds : [],
          valuesIds: Array.isArray(p.valuesIds) ? p.valuesIds : [],
          rangeValue: p.rangeValue || null,
        })),
      };

      // Add EAN if available
      if (ean) {
        const eanParam = parameters.find((p: any) => String(p.id) === '225693' || p.name === 'EAN (GTIN)');
        if (!eanParam) {
          productPayload.parameters.push({
            id: '225693',
            values: [ean],
          });
        }
      }

      // Add manufacturer code if available
      if (manufacturerCode) {
        const manufacturerCodeParam = parameters.find(
          (p: any) => String(p.id) === '224017' || p.name === 'Kód výrobce',
        );
        if (!manufacturerCodeParam) {
          productPayload.parameters.push({
            id: '224017',
            values: [manufacturerCode],
          });
        }
      }

      // Add brand if available
      if (brand) {
        const brandParam = parameters.find((p: any) => String(p.id) === '248811' || p.name === 'Značka');
        if (!brandParam) {
          productPayload.parameters.push({
            id: '248811',
            values: [brand],
          });
        }
      }

      // Validate required fields
      if (!categoryId) {
        throw new Error('Category ID is required to create product');
      }

      this.logger.log('[createProductOnAllegro] Creating product on Allegro', {
        offerId: offer.id,
        productName,
        categoryId,
        hasBrand: !!brand,
        hasManufacturerCode: !!manufacturerCode,
        hasEAN: !!ean,
        parametersCount: productPayload.parameters.length,
      });

      const createdProduct = await this.allegroApi.createProductWithOAuthToken(oauthToken, productPayload);

      if (!createdProduct?.id) {
        throw new Error('Product creation succeeded but no product ID returned');
      }

      this.logger.log('[createProductOnAllegro] Product created successfully', {
        offerId: offer.id,
        productId: createdProduct.id,
      });

      return String(createdProduct.id);
    } catch (error: any) {
      this.logger.error('[createProductOnAllegro] Failed to create product', {
        error: error.message,
        offerId: offer.id,
        errorData: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Publish multiple offers to Allegro
   * For each offer:
   * - If offer exists on Allegro: update it
   * - If offer doesn't exist: search for product, create if needed, then create offer
   * Returns summary with success/failure results
   */
  async publishOffersToAllegro(userId: string, offerIds: string[]): Promise<any> {
    this.logger.log('[publishOffersToAllegro] Starting bulk publish', {
      userId,
      offerCount: offerIds.length,
    });

    const results: Array<{ offerId: string; status: 'success' | 'failed'; error?: string; allegroOfferId?: string }> = [];
    let successful = 0;
    let failed = 0;

    // Get OAuth token once for all operations
    let oauthToken: string;
    try {
      oauthToken = await this.getUserOAuthToken(userId);
    } catch (error: any) {
      this.logger.error('[publishOffersToAllegro] Failed to get OAuth token', {
        userId,
        error: error.message,
      });
      throw error;
    }

    // Process each offer
    for (const offerId of offerIds) {
      try {
        this.logger.log('[publishOffersToAllegro] Processing offer', { offerId, userId });

        // Load offer from database with relations
        const offer = await this.prisma.allegroOffer.findUnique({
          where: { id: offerId },
          include: {
            product: true,
            allegroProduct: {
              include: {
                parameters: true,
              },
            },
          } as any,
        });

        if (!offer) {
          throw new Error(`Offer not found: ${offerId}`);
        }

        // Check if offer already exists on Allegro
        if (offer.allegroOfferId && !offer.allegroOfferId.startsWith('local-')) {
          // Offer exists on Allegro - update it
          try {
            this.logger.log('[publishOffersToAllegro] Updating existing offer', {
              offerId,
              allegroOfferId: offer.allegroOfferId,
            });

            // Fetch current offer from Allegro to get all required fields
            let currentAllegroOffer: any = null;
            try {
              currentAllegroOffer = await this.allegroApi.getOfferWithOAuthToken(oauthToken, offer.allegroOfferId);
              this.logger.log('[publishOffersToAllegro] Fetched current offer from Allegro', {
                offerId,
                hasParameters: !!currentAllegroOffer?.parameters,
                parametersCount: currentAllegroOffer?.parameters?.length || 0,
              });
            } catch (fetchError: any) {
              this.logger.warn('[publishOffersToAllegro] Failed to fetch current offer, using stored rawData', {
                offerId,
                error: fetchError.message,
              });
              // Use stored rawData as fallback
              currentAllegroOffer = offer.rawData;
            }

            // Use current offer from API if available, otherwise use stored rawData
            const sourceOffer = currentAllegroOffer || offer.rawData || offer;

            // Transform offer data for update - use database values but preserve all required fields from Allegro
            // We explicitly pass all database values to ensure Allegro is updated with our data
            const updatePayload = this.transformDtoToAllegroFormat(
              {
                title: offer.title, // Use database title
                description: offer.description, // Use database description (will be omitted in PATCH)
                categoryId: offer.categoryId, // Use database category
                price: Number(offer.price), // Use database price
                currency: offer.currency, // Use database currency
                stockQuantity: offer.stockQuantity, // Use database stock
                images: (offer.images as any) || (sourceOffer as any)?.images, // Use database images or fallback
                attributes: (offer.rawData as any)?.parameters || (sourceOffer as any)?.parameters || [], // Preserve parameters
                deliveryOptions: offer.deliveryOptions as any || (sourceOffer as any)?.delivery, // Use database or fallback
                paymentOptions: offer.paymentOptions as any || (sourceOffer as any)?.payments, // Use database or fallback
              },
              { ...offer, rawData: sourceOffer },
            );

            // Ensure we're updating with database values - override with our data
            // This ensures Allegro is updated with values from our database
            if (offer.title) updatePayload.name = offer.title;
            if (offer.categoryId) updatePayload.category = { id: offer.categoryId };
            if (offer.price !== undefined) {
              updatePayload.sellingMode = {
                price: {
                  amount: String(offer.price),
                  currency: offer.currency || this.getDefaultCurrency(),
                },
              };
            }
            if (offer.stockQuantity !== undefined) {
              updatePayload.stock = {
                available: offer.stockQuantity,
              };
            }

            // Log payload before sending
            this.logger.log('[publishOffersToAllegro] Sending update payload', {
              offerId,
              allegroOfferId: offer.allegroOfferId,
              payloadKeys: Object.keys(updatePayload),
              hasImages: !!updatePayload.images,
              imagesCount: updatePayload.images?.length || 0,
              hasParameters: !!updatePayload.parameters,
              parametersCount: updatePayload.parameters?.length || 0,
              hasCategory: !!updatePayload.category,
              hasSellingMode: !!updatePayload.sellingMode,
              hasStock: !!updatePayload.stock,
            });

            await this.allegroApi.updateOfferWithOAuthToken(oauthToken, offer.allegroOfferId, updatePayload);

            // Update sync status in database
            await this.prisma.allegroOffer.update({
              where: { id: offerId },
              data: {
                syncStatus: 'SYNCED',
                syncSource: 'MANUAL',
                lastSyncedAt: new Date(),
                syncError: null,
              } as any,
            });

            results.push({
              offerId,
              status: 'success',
              allegroOfferId: offer.allegroOfferId,
            });
            successful++;

            this.logger.log('[publishOffersToAllegro] Offer updated successfully', {
              offerId,
              allegroOfferId: offer.allegroOfferId,
            });
          } catch (error: any) {
            const errorData = error.response?.data || {};
            const errorMessage = this.extractErrorMessage(error);
            const errorDetails = JSON.stringify(errorData, null, 2);

            this.logger.error('[publishOffersToAllegro] Failed to update offer', {
              offerId,
              allegroOfferId: offer.allegroOfferId,
              error: error.message,
              extractedErrorMessage: errorMessage,
              status: error.response?.status,
              errorData,
              errorDetails,
            });

            await this.prisma.allegroOffer.update({
              where: { id: offerId },
              data: {
                syncStatus: 'ERROR',
                syncError: errorMessage,
              } as any,
            });

            results.push({
              offerId,
              status: 'failed',
              error: errorMessage,
              allegroOfferId: offer.allegroOfferId,
            });
            failed++;
          }
        } else {
          // Offer doesn't exist on Allegro - create it
          try {
            this.logger.log('[publishOffersToAllegro] Creating new offer', { offerId });

            // Search for product on Allegro
            let allegroProductId: string | null = await this.searchProductOnAllegro(oauthToken, offer);

            // If product not found, create it
            if (!allegroProductId) {
              this.logger.log('[publishOffersToAllegro] Product not found, creating new product', { offerId });
              allegroProductId = await this.createProductOnAllegro(oauthToken, offer);
            }

            // Build offer payload
            const offerPayload: any = {
              name: offer.title,
              category: { id: offer.categoryId },
              sellingMode: {
                format: 'BUY_NOW',
                price: {
                  amount: String(offer.price),
                  currency: offer.currency || this.getDefaultCurrency(),
                },
              },
              stock: {
                available: offer.stockQuantity || offer.quantity || 0,
              },
              publication: {
                duration: 'P30D', // 30 days
              },
            };

            // Add description if available
            if (offer.description) {
              offerPayload.description = offer.description;
            }

            // Add images - REQUIRED field, must have at least one
            let images: any[] = [];
            if (offer.images && Array.isArray(offer.images) && offer.images.length > 0) {
              images = offer.images.map((img: any) => ({
                url: typeof img === 'string' ? img : img.url || img.path,
              })).filter((img: any) => img.url); // Filter out invalid images
            } else if ((offer.rawData as any)?.images && Array.isArray((offer.rawData as any).images)) {
              images = (offer.rawData as any).images.map((img: any) => ({
                url: typeof img === 'string' ? img : img.url || img.path,
              })).filter((img: any) => img.url);
            }

            if (images.length === 0) {
              throw new Error('Images are required to create an offer on Allegro. Please add at least one image.');
            }
            offerPayload.images = images;

            // Add parameters if available
            const allegroProduct = offer.allegroProduct as any;
            const parameters =
              (offer.rawData as any)?.parameters ||
              (allegroProduct?.parameters && Array.isArray(allegroProduct.parameters)
                ? allegroProduct.parameters.map((p: any) => ({
                    id: p.parameterId,
                    values: Array.isArray(p.values) ? p.values : p.valuesIds || [],
                    valuesIds: Array.isArray(p.valuesIds) ? p.valuesIds : [],
                  }))
                : null) ||
              [];

            if (parameters.length > 0) {
              offerPayload.parameters = parameters.map((p: any) => ({
                id: String(p.id || p.parameterId),
                values: Array.isArray(p.values) ? p.values : [],
                valuesIds: Array.isArray(p.valuesIds) ? p.valuesIds : [],
              }));
            }

            // Add product reference - REQUIRED for product-offers endpoint
            if (allegroProductId) {
              offerPayload.productSet = [
                {
                  product: {
                    id: allegroProductId,
                  },
                },
              ];
            } else {
              throw new Error('Product is required to create an offer. Product not found and could not be created.');
            }

            // Add delivery options - use from database or rawData, or provide defaults
            if (offer.deliveryOptions) {
              offerPayload.delivery = offer.deliveryOptions;
            } else if ((offer.rawData as any)?.delivery) {
              offerPayload.delivery = (offer.rawData as any).delivery;
            } else {
              // Provide default delivery options if missing
              offerPayload.delivery = {
                shippingRates: {
                  id: '0', // Default shipping rate
                },
              };
            }

            // Add payment options - use from database or rawData, or provide defaults
            if (offer.paymentOptions) {
              offerPayload.payments = offer.paymentOptions;
            } else if ((offer.rawData as any)?.payments) {
              offerPayload.payments = (offer.rawData as any).payments;
            } else {
              // Provide default payment options if missing
              offerPayload.payments = {
                invoice: 'VAT',
              };
            }

            // Add location if missing (might be required)
            if (!offerPayload.location && (offer.rawData as any)?.location) {
              offerPayload.location = (offer.rawData as any).location;
            }

            // Log payload before creating
            this.logger.log('[publishOffersToAllegro] Creating offer payload', {
              offerId,
              payloadKeys: Object.keys(offerPayload),
              hasImages: !!offerPayload.images,
              imagesCount: offerPayload.images?.length || 0,
              hasParameters: !!offerPayload.parameters,
              parametersCount: offerPayload.parameters?.length || 0,
              hasProductSet: !!offerPayload.productSet,
              hasDelivery: !!offerPayload.delivery,
              hasPayments: !!offerPayload.payments,
            });

            // Create offer on Allegro
            const createdOffer = await this.allegroApi.createOfferWithOAuthToken(oauthToken, offerPayload);

            if (!createdOffer?.id) {
              throw new Error('Offer creation succeeded but no offer ID returned');
            }

            // Update offer in database with Allegro offer ID
            await this.prisma.allegroOffer.update({
              where: { id: offerId },
              data: {
                allegroOfferId: String(createdOffer.id),
                syncStatus: 'SYNCED',
                syncSource: 'MANUAL',
                lastSyncedAt: new Date(),
                syncError: null,
                rawData: createdOffer,
                publicationStatus: createdOffer.publication?.status || 'INACTIVE',
              } as any,
            });

            results.push({
              offerId,
              status: 'success',
              allegroOfferId: String(createdOffer.id),
            });
            successful++;

            this.logger.log('[publishOffersToAllegro] Offer created successfully', {
              offerId,
              allegroOfferId: createdOffer.id,
            });
          } catch (error: any) {
            const errorData = error.response?.data || {};
            const errorMessage = this.extractErrorMessage(error);
            const errorDetails = JSON.stringify(errorData, null, 2);

            this.logger.error('[publishOffersToAllegro] Failed to create offer', {
              offerId,
              error: error.message,
              extractedErrorMessage: errorMessage,
              status: error.response?.status,
              errorData,
              errorDetails,
            });

            await this.prisma.allegroOffer.update({
              where: { id: offerId },
              data: {
                syncStatus: 'ERROR',
                syncError: errorMessage,
              } as any,
            });

            results.push({
              offerId,
              status: 'failed',
              error: errorMessage,
            });
            failed++;
          }
        }
      } catch (error: any) {
        const errorMessage = this.extractErrorMessage(error);
        this.logger.error('[publishOffersToAllegro] Failed to process offer', {
          offerId,
          error: error.message,
          extractedErrorMessage: errorMessage,
        });

        results.push({
          offerId,
          status: 'failed',
          error: errorMessage,
        });
        failed++;
      }
    }

    const summary = {
      total: offerIds.length,
      successful,
      failed,
      results,
    };

    this.logger.log('[publishOffersToAllegro] Bulk publish completed', {
      userId,
      summary,
    });

    return summary;
  }
}

