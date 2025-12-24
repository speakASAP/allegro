/**
 * Inventory Service
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService, WarehouseClientService } from '@allegro/shared';
import { AllegroApiService } from '../allegro-api.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
    private readonly warehouseClient: WarehouseClientService,
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
  async updateStock(offerId: string, quantity: number): Promise<any> {
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

    // Update stock in warehouse-microservice if product is linked
    if (offer.catalogProductId) {
      try {
        // Get warehouse ID (default to first warehouse or configure)
        // For now, we'll need to determine the warehouse ID - this should come from configuration
        // TODO: Get warehouse ID from configuration or offer settings
        const warehouseId = process.env.DEFAULT_WAREHOUSE_ID;
        if (warehouseId) {
          await this.warehouseClient.setStock(
            offer.catalogProductId,
            warehouseId,
            quantity,
            `Stock updated from Allegro offer ${offer.allegroOfferId}`
          );
          this.logger.log(`Updated stock in warehouse-microservice for product ${offer.catalogProductId}`, 'InventoryService');
        }
      } catch (error: any) {
        this.logger.error(`Failed to update stock in warehouse-microservice: ${error.message}`, error.stack, 'InventoryService');
        // Don't throw - allow offer update to succeed even if warehouse update fails
      }
    }

    return updated;
  }
}

