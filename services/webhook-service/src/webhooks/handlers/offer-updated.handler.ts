/**
 * Offer Updated Handler
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';

@Injectable()
export class OfferUpdatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Handle offer updated event
   */
  async handle(payload: any) {
    this.logger.log('Handling offer updated event', { offerId: payload.offer?.id });

    const offer = payload.offer;
    if (!offer) return;

    // Update offer in database
    await this.prisma.allegroOffer.updateMany({
      where: { allegroOfferId: offer.id },
      data: {
        price: parseFloat(offer.sellingMode?.price?.amount || '0'),
        quantity: offer.stock?.available || 0,
        stockQuantity: offer.stock?.available || 0,
        status: offer.publication?.status || 'INACTIVE',
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    return { success: true };
  }
}

