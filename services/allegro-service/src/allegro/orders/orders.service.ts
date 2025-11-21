/**
 * Orders Service
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, LoggerService } from '@allegro/shared';
import { AllegroApiService } from '../allegro-api.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get orders from database
   */
  async getOrders(query: any) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    const [items, total] = await Promise.all([
      this.prisma.allegroOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          offer: {
            include: {
              product: true,
            },
          },
          product: true,
        },
        orderBy: { orderDate: 'desc' },
      }),
      this.prisma.allegroOrder.count({ where }),
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
   * Get order by ID
   */
  async getOrder(id: string) {
    const order = await this.prisma.allegroOrder.findUnique({
      where: { id },
      include: {
        offer: {
          include: {
            product: true,
          },
        },
        product: true,
      },
    });

    if (!order) {
      throw new Error(`Order with ID ${id} not found`);
    }

    return order;
  }

  /**
   * Fetch orders from Allegro API and sync to database
   */
  async syncOrdersFromAllegro() {
    this.logger.log('Syncing orders from Allegro');

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalSynced = 0;

    while (hasMore) {
      try {
        const response = await this.allegroApi.getOrders({
          limit,
          offset,
        });

        const orders = response.orders || [];
        
        for (const allegroOrder of orders) {
          try {
            // Find related offer
            const offer = await this.prisma.allegroOffer.findFirst({
              where: { allegroOfferId: allegroOrder.lineItems?.[0]?.offer?.id || '' },
            });

            await this.prisma.allegroOrder.upsert({
              where: { allegroOrderId: allegroOrder.id },
              update: {
                quantity: allegroOrder.lineItems?.[0]?.quantity || 1,
                price: parseFloat(allegroOrder.lineItems?.[0]?.price?.amount || '0'),
                totalPrice: parseFloat(allegroOrder.totalPrice?.amount || '0'),
                currency: allegroOrder.totalPrice?.currency || this.configService.get<string>('PRICE_CURRENCY_TARGET') || 'PLN',
                status: allegroOrder.status || 'NEW',
                paymentStatus: allegroOrder.payment?.status,
                fulfillmentStatus: allegroOrder.fulfillment?.status,
                buyerEmail: allegroOrder.buyer?.email,
                buyerLogin: allegroOrder.buyer?.login,
                updatedAt: new Date(),
              },
              create: {
                allegroOrderId: allegroOrder.id,
                allegroOfferId: offer?.id || '',
                productId: offer?.productId || null,
                quantity: allegroOrder.lineItems?.[0]?.quantity || 1,
                price: parseFloat(allegroOrder.lineItems?.[0]?.price?.amount || '0'),
                totalPrice: parseFloat(allegroOrder.totalPrice?.amount || '0'),
                currency: allegroOrder.totalPrice?.currency || this.configService.get<string>('PRICE_CURRENCY_TARGET') || 'PLN',
                status: allegroOrder.status || 'NEW',
                paymentStatus: allegroOrder.payment?.status,
                fulfillmentStatus: allegroOrder.fulfillment?.status,
                buyerEmail: allegroOrder.buyer?.email,
                buyerLogin: allegroOrder.buyer?.login,
                orderDate: new Date(allegroOrder.createdAt || Date.now()),
              },
            });
            totalSynced++;
          } catch (error: any) {
            this.logger.error('Failed to sync order', {
              orderId: allegroOrder.id,
              error: error.message,
            });
          }
        }

        hasMore = orders.length === limit;
        offset += limit;
      } catch (error: any) {
        this.logger.error('Failed to fetch orders from Allegro', {
          error: error.message,
        });
        hasMore = false;
      }
    }

    this.logger.log('Finished syncing orders', { totalSynced });
    return { totalSynced };
  }
}

