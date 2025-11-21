/**
 * Offers Service
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';
import { AllegroApiService } from '../allegro-api.service';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
  ) {}

  /**
   * Get offers from database
   */
  async getOffers(query: any) {
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
  async getOffer(id: string) {
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
  async createOffer(dto: any) {
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
  async updateOffer(id: string, dto: any) {
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
  async updateStock(id: string, quantity: number) {
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
   * Import all offers from Allegro
   */
  async importAllOffers() {
    this.logger.log('Importing all offers from Allegro');

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalImported = 0;

    while (hasMore) {
      const response = await this.allegroApi.getOffers({
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
    }

    this.logger.log('Finished importing offers', { totalImported });
    return { totalImported };
  }
}

