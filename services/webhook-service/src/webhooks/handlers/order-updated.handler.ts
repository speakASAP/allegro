/**
 * Order Updated Handler
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, LoggerService, NotificationService } from '@allegro/shared';

@Injectable()
export class OrderUpdatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Handle order updated event
   */
  async handle(payload: any) {
    this.logger.log('Handling order updated event', { orderId: payload.order?.id });

    const order = payload.order;
    if (!order) return;

    // Update order in database
    await this.prisma.allegroOrder.updateMany({
      where: { allegroOrderId: order.id },
      data: {
        status: order.status || 'NEW',
        paymentStatus: order.payment?.status,
        fulfillmentStatus: order.fulfillment?.status,
        updatedAt: new Date(),
      },
    });

    // If cancelled, restore stock
    if (order.status === 'CANCELLED') {
      await this.restoreStockFromOrder(order);
    }

    // If paid, send notification
    if (order.status === 'PAID' && this.configService.get<string>('NOTIFICATION_ORDER_UPDATED') === 'true') {
      const adminEmail = this.configService.get<string>('NOTIFICATION_EMAIL_TO') || 'admin@statex.cz';
      await this.notificationService.sendNotification({
        channel: 'email',
        type: 'order_status_update',
        recipient: order.buyer?.email || adminEmail,
        subject: `Order ${order.id} Status Update`,
        message: `Your order ${order.id} has been paid and is being processed.`,
      });
    }

    return { success: true };
  }

  /**
   * Restore stock from cancelled order
   */
  private async restoreStockFromOrder(order: any) {
    const offerId = order.lineItems?.[0]?.offer?.id;
    const quantity = order.lineItems?.[0]?.quantity || 1;

    const offer = await this.prisma.allegroOffer.findFirst({
      where: { allegroOfferId: offerId },
    });

    if (offer && offer.productId) {
      // Restore stock
      await this.prisma.product.update({
        where: { id: offer.productId },
        data: {
          stockQuantity: { increment: quantity },
        },
      });

      await this.prisma.allegroOffer.update({
        where: { id: offer.id },
        data: {
          stockQuantity: { increment: quantity },
          quantity: { increment: quantity },
        },
      });
    }
  }
}

