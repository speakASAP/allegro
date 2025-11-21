/**
 * Inventory Service
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';
import { AllegroApiService } from '../allegro-api.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
  ) {}

  /**
   * Get stock for offer
   */
  async getStock(offerId: string) {
    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      throw new Error(`Offer with ID ${offerId} not found`);
    }

    // Try to fetch from Allegro API
    try {
      const allegroOffer = await this.allegroApi.getOffer(offer.allegroOfferId);
      return {
        offerId,
        stockQuantity: allegroOffer.stock?.available || 0,
        reservedQuantity: allegroOffer.stock?.reserved || 0,
      };
    } catch (error: any) {
      // Fallback to database
      return {
        offerId,
        stockQuantity: offer.stockQuantity,
        reservedQuantity: 0,
      };
    }
  }

  /**
   * Update stock for offer
   */
  async updateStock(offerId: string, quantity: number) {
    const offer = await this.prisma.allegroOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      throw new Error(`Offer with ID ${offerId} not found`);
    }

    // Update via Allegro API
    await this.allegroApi.updateOfferStock(offer.allegroOfferId, quantity);

    // Update in database
    const updated = await this.prisma.allegroOffer.update({
      where: { id: offerId },
      data: {
        stockQuantity: quantity,
        quantity,
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    // Update product stock if linked
    if (offer.productId) {
      await this.prisma.product.update({
        where: { id: offer.productId },
        data: {
          stockQuantity: quantity,
        },
      });
    }

    return updated;
  }
}

