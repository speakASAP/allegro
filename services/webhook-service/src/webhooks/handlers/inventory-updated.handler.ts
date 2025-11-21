/**
 * Inventory Updated Handler
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, LoggerService, NotificationService } from '@allegro/shared';

@Injectable()
export class InventoryUpdatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Handle inventory updated event
   */
  async handle(payload: any) {
    this.logger.log('Handling inventory updated event', { offerId: payload.offer?.id });

    const offer = payload.offer;
    if (!offer) return;

    const stockQuantity = offer.stock?.available || 0;

    // Update stock in database
    await this.prisma.allegroOffer.updateMany({
      where: { allegroOfferId: offer.id },
      data: {
        stockQuantity: stockQuantity,
        quantity: stockQuantity,
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    // Update product stock if linked
    const dbOffer = await this.prisma.allegroOffer.findFirst({
      where: { allegroOfferId: offer.id },
    });

    if (dbOffer && dbOffer.productId) {
      await this.prisma.product.update({
        where: { id: dbOffer.productId },
        data: {
          stockQuantity: stockQuantity,
        },
      });

      // Check if stock is low
      const product = await this.prisma.product.findUnique({
        where: { id: dbOffer.productId },
      });

      if (product && product.minimumRequiredStockQuantity) {
        if (stockQuantity <= product.minimumRequiredStockQuantity) {
          // Send low stock notification
          if (this.configService.get<string>('NOTIFICATION_STOCK_LOW') === 'true') {
            await this.notificationService.sendStockLowNotification(
              product.code,
              stockQuantity,
              product.minimumRequiredStockQuantity,
            );
          }
        }
      }
    }

    return { success: true };
  }
}

