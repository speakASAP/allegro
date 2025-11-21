/**
 * Order Created Handler
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, LoggerService, NotificationService } from '@allegro/shared';

@Injectable()
export class OrderCreatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Handle order created event
   */
  async handle(payload: any) {
    this.logger.log('Handling order created event', { orderId: payload.order?.id });

    const order = payload.order;
    if (!order) return;

    // Create order in database
    const createdOrder = await this.prisma.allegroOrder.create({
      data: {
        allegroOrderId: order.id,
        allegroOfferId: order.lineItems?.[0]?.offer?.id || '',
        quantity: order.lineItems?.[0]?.quantity || 1,
        price: parseFloat(order.lineItems?.[0]?.price?.amount || '0'),
        totalPrice: parseFloat(order.totalPrice?.amount || '0'),
        currency: order.totalPrice?.currency || this.configService.get<string>('PRICE_CURRENCY_TARGET') || 'PLN',
        status: 'NEW',
        orderDate: new Date(order.createdAt || Date.now()),
        buyerEmail: order.buyer?.email,
        buyerLogin: order.buyer?.login,
      },
    });

    // Update stock
    if (order.lineItems?.[0]?.offer?.id) {
      await this.updateStockFromOrder(order);
    }

    // Send notification
    if (this.configService.get<string>('NOTIFICATION_ORDER_CREATED') === 'true') {
      await this.notificationService.sendOrderConfirmation(
        order.buyer?.email || this.configService.get<string>('NOTIFICATION_EMAIL_TO') || '',
        order.id,
        parseFloat(order.totalPrice?.amount || '0'),
        order.totalPrice?.currency || this.configService.get<string>('PRICE_CURRENCY_TARGET') || 'PLN',
      );
    }

    return createdOrder;
  }

  /**
   * Update stock from order
   */
  private async updateStockFromOrder(order: any) {
    const offerId = order.lineItems?.[0]?.offer?.id;
    const quantity = order.lineItems?.[0]?.quantity || 1;

    // Find offer
    const offer = await this.prisma.allegroOffer.findFirst({
      where: { allegroOfferId: offerId },
    });

    if (offer && offer.productId) {
      // Decrease stock
      await this.prisma.product.update({
        where: { id: offer.productId },
        data: {
          stockQuantity: { decrement: quantity },
        },
      });

      // Update offer stock
      await this.prisma.allegroOffer.update({
        where: { id: offer.id },
        data: {
          stockQuantity: { decrement: quantity },
          quantity: { decrement: quantity },
        },
      });
    }
  }
}

