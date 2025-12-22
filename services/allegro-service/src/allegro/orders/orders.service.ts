/**
 * Orders Service
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, LoggerService, OrderClientService } from '@allegro/shared';
import { AllegroApiService } from '../allegro-api.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly allegroApi: AllegroApiService,
    private readonly configService: ConfigService,
    private readonly orderClient: OrderClientService,
  ) {}

  /**
   * Get orders from database
   */
  async getOrders(query: any): Promise<{ items: any[]; pagination: any }> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
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

    this.logger.log(`[${timestamp}] [TIMING] OrdersService.getOrders START`, {
      filters: {
        status: query.status,
        paymentStatus: query.paymentStatus,
      },
      pagination: { page, limit, skip },
    });

    // Optimized: Load orders without relations for faster list loading
    // Relations can be loaded on-demand when viewing order details
    const dbQueryStartTime = Date.now();
    const [items, total] = await Promise.all([
      this.prisma.allegroOrder.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          allegroOrderId: true,
          buyerEmail: true,
          buyerLogin: true,
          quantity: true,
          price: true,
          totalPrice: true,
          currency: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          orderDate: true,
          createdAt: true,
          updatedAt: true,
          // Relations removed for faster list loading - can be loaded on-demand when viewing details
          // offer: {
          //   include: {
          //     product: true,
          //   },
          // },
          // product: true,
        },
        orderBy: { orderDate: 'desc' },
      }),
      this.prisma.allegroOrder.count({ where }),
    ]);
    const dbQueryDuration = Date.now() - dbQueryStartTime;
    const totalDuration = Date.now() - startTime;

    this.logger.log(`[${new Date().toISOString()}] [TIMING] OrdersService.getOrders: Database query completed (${dbQueryDuration}ms)`, {
      total,
      returned: items.length,
      page,
      limit,
    });
    this.logger.log(`[${new Date().toISOString()}] [TIMING] OrdersService.getOrders COMPLETE (${totalDuration}ms total)`, {
      total,
      returned: items.length,
      page,
      limit,
      dbQueryDurationMs: dbQueryDuration,
      totalDurationMs: totalDuration,
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
   * Get order by ID
   */
  async getOrder(id: string): Promise<any> {
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

            const savedOrder = await this.prisma.allegroOrder.upsert({
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

            // Forward order to orders-microservice
            if (savedOrder && offer) {
              try {
                const orderData = {
                  externalOrderId: allegroOrder.id,
                  channel: 'allegro',
                  channelAccountId: offer.accountId || undefined,
                  customer: {
                    email: allegroOrder.buyer?.email,
                    login: allegroOrder.buyer?.login,
                  },
                  items: allegroOrder.lineItems?.map((item: any) => ({
                    productId: offer?.productId || null,
                    sku: offer?.sku || null,
                    title: item.offer?.name || offer?.title || 'Product',
                    quantity: item.quantity || 1,
                    unitPrice: parseFloat(item.price?.amount || '0'),
                    totalPrice: parseFloat(item.price?.amount || '0') * (item.quantity || 1),
                  })) || [],
                  subtotal: parseFloat(allegroOrder.totalPrice?.amount || '0'),
                  shippingCost: 0,
                  taxAmount: 0,
                  total: parseFloat(allegroOrder.totalPrice?.amount || '0'),
                  currency: allegroOrder.totalPrice?.currency || 'PLN',
                  paymentStatus: allegroOrder.payment?.status,
                  orderedAt: new Date(allegroOrder.createdAt || Date.now()),
                };

                await this.orderClient.createOrder(orderData);
                this.logger.log('Order forwarded to orders-microservice', {
                  allegroOrderId: allegroOrder.id,
                  localOrderId: savedOrder.id,
                });
              } catch (error: any) {
                // Log error but don't fail the sync
                this.logger.error('Failed to forward order to orders-microservice', {
                  allegroOrderId: allegroOrder.id,
                  error: error.message,
                });
              }
            }

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

