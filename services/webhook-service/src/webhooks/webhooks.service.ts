/**
 * Webhooks Service
 * Handles Allegro webhook events
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService, NotificationService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { OrderCreatedHandler } from './handlers/order-created.handler';
import { OrderUpdatedHandler } from './handlers/order-updated.handler';
import { OfferUpdatedHandler } from './handlers/offer-updated.handler';
import { InventoryUpdatedHandler } from './handlers/inventory-updated.handler';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly notificationService: NotificationService,
    private readonly orderCreatedHandler: OrderCreatedHandler,
    private readonly orderUpdatedHandler: OrderUpdatedHandler,
    private readonly offerUpdatedHandler: OfferUpdatedHandler,
    private readonly inventoryUpdatedHandler: InventoryUpdatedHandler,
  ) {}

  /**
   * Process webhook event
   */
  async processEvent(eventType: string, payload: any) {
    this.logger.log('Processing webhook event', { eventType });

    // Save event to database
    const webhookEvent = await this.prisma.webhookEvent.create({
      data: {
        eventId: payload.id || `${eventType}-${Date.now()}`,
        eventType,
        source: 'ALLEGRO',
        payload,
        processed: false,
      },
    });

    try {
      // Process based on event type
      switch (eventType) {
        case 'order.created':
          await this.orderCreatedHandler.handle(payload);
          break;
        case 'order.updated':
          await this.orderUpdatedHandler.handle(payload);
          break;
        case 'offer.updated':
          await this.offerUpdatedHandler.handle(payload);
          break;
        case 'inventory.updated':
        case 'offer.inventory.updated':
          await this.inventoryUpdatedHandler.handle(payload);
          break;
        default:
          this.logger.warn('Unknown event type', { eventType });
      }

      // Mark as processed
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      return { success: true };
    } catch (error: any) {
      // Update error
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processingError: error.message,
          retryCount: { increment: 1 },
        },
      });

      throw error;
    }
  }


  /**
   * Get webhook events
   */
  async getEvents(query: any) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.eventType) {
      where.eventType = query.eventType;
    }
    if (query.processed !== undefined) {
      where.processed = query.processed === 'true';
    }

    const [items, total] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.webhookEvent.count({ where }),
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
   * Get webhook event by ID
   */
  async getEvent(id: string) {
    return this.prisma.webhookEvent.findUnique({
      where: { id },
    });
  }

  /**
   * Retry processing webhook event
   */
  async retryEvent(id: string) {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id },
    });

    if (!event) {
      throw new Error(`Webhook event with ID ${id} not found`);
    }

    if (event.processed) {
      throw new Error(`Webhook event ${id} is already processed`);
    }

    try {
      // Reprocess the event
      await this.processEvent(event.eventType, event.payload as any);

      return { success: true };
    } catch (error: any) {
      // Update retry count
      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          retryCount: { increment: 1 },
          processingError: error.message,
        },
      });

      throw error;
    }
  }
}

