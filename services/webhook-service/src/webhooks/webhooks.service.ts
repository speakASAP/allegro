/**
 * Webhooks Service (Event Polling)
 * Polls Allegro API for events and processes them
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService, NotificationService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { OrderCreatedHandler } from './handlers/order-created.handler';
import { OrderUpdatedHandler } from './handlers/order-updated.handler';
import { OfferUpdatedHandler } from './handlers/offer-updated.handler';
import { InventoryUpdatedHandler } from './handlers/inventory-updated.handler';

@Injectable()
export class WebhooksService {
  private readonly allegroServiceUrl: string;
  private readonly EVENT_POLLING_KEY_OFFERS = 'last_offer_event_id';
  private readonly EVENT_POLLING_KEY_ORDERS = 'last_order_event_id';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly notificationService: NotificationService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly orderCreatedHandler: OrderCreatedHandler,
    private readonly orderUpdatedHandler: OrderUpdatedHandler,
    private readonly offerUpdatedHandler: OfferUpdatedHandler,
    private readonly inventoryUpdatedHandler: InventoryUpdatedHandler,
  ) {
    this.allegroServiceUrl = this.configService.get<string>('ALLEGRO_SERVICE_URL');
    if (!this.allegroServiceUrl) {
      throw new Error('Missing required environment variable: ALLEGRO_SERVICE_URL. Please set it in your .env file.');
    }
  }

  /**
   * Get last processed event ID from database
   */
  private async getLastEventId(key: string): Promise<string | null> {
    // Store last event IDs in user_settings table or use a simple in-memory cache
    // For now, we'll get the latest processed event from webhook_events table
    const lastEvent = await this.prisma.webhookEvent.findFirst({
      where: {
        source: 'ALLEGRO',
        processed: true,
      },
      orderBy: { createdAt: 'desc' },
      select: { eventId: true },
    });
    return lastEvent?.eventId || null;
  }

  /**
   * Poll Allegro events and process them
   */
  async pollEvents() {
    this.logger.log('Polling Allegro events');
    let processedCount = 0;
    let lastOfferEventId: string | null = null;
    let lastOrderEventId: string | null = null;

    try {
      // Get last processed event IDs
      const lastOfferId = await this.getLastEventId(this.EVENT_POLLING_KEY_OFFERS);
      const lastOrderId = await this.getLastEventId(this.EVENT_POLLING_KEY_ORDERS);

      // Poll offer events
      try {
        const offerEventsResponse = await firstValueFrom(
          this.httpService.get(`${this.allegroServiceUrl}/allegro/events/offers`, {
            params: {
              after: lastOfferId || undefined,
              limit: 100,
            },
          }),
        );

        // Handle Allegro API response format
        // Response structure: { events: [...], lastEventId: "..." } or { data: { events: [...] } }
        const responseData = offerEventsResponse.data?.data || offerEventsResponse.data || {};
        const offerEvents = responseData.events || [];
        const lastEventIdFromResponse = responseData.lastEventId;

        this.logger.log('Fetched offer events', { 
          count: offerEvents.length,
          lastEventId: lastEventIdFromResponse,
        });

        for (const event of offerEvents) {
          // Allegro event structure: { id, type, occurredAt, offer: {...} }
          const eventId = event.id || event.eventId || `${event.type || 'unknown'}-${Date.now()}`;
          
          // Check if event already processed
          const existingEvent = await this.prisma.webhookEvent.findUnique({
            where: { eventId },
          });

          if (!existingEvent) {
            // Process the event with the full payload
            await this.processEvent(
              this.mapAllegroEventType(event.type || event.eventType || 'unknown'),
              event
            );
            processedCount++;
          } else {
            this.logger.debug('Event already processed', { eventId });
          }

          // Track last event ID
          if (event.id || event.eventId) {
            lastOfferEventId = event.id || event.eventId;
          }
        }

        // Use lastEventId from response if available
        if (lastEventIdFromResponse) {
          lastOfferEventId = lastEventIdFromResponse;
        }
      } catch (error: any) {
        this.logger.error('Failed to poll offer events', { error: error.message });
      }

      // Poll order events
      // Note: Allegro may not have a dedicated order events endpoint
      // Order updates are typically handled via order sync service
      try {
        const orderEventsResponse = await firstValueFrom(
          this.httpService.get(`${this.allegroServiceUrl}/allegro/events/orders`, {
            params: {
              after: lastOrderId || undefined,
              limit: 100,
            },
          }),
        );

        // Handle Allegro API response format
        // Note: Allegro may not have a dedicated /order/events endpoint
        // We may need to use /order/orders with filtering or check order status changes
        const responseData = orderEventsResponse.data?.data || orderEventsResponse.data || {};
        const orderEvents = responseData.events || responseData.orders || [];
        const lastEventIdFromResponse = responseData.lastEventId;

        this.logger.log('Fetched order events', { 
          count: orderEvents.length,
          lastEventId: lastEventIdFromResponse,
        });

        for (const event of orderEvents) {
          // Handle both event format and direct order format
          const eventId = event.id || event.eventId || event.orderId || `${event.type || 'order.updated'}-${Date.now()}`;
          const eventType = event.type || event.eventType || (event.id ? 'order.updated' : 'order.created');
          
          // Check if event already processed
          const existingEvent = await this.prisma.webhookEvent.findUnique({
            where: { eventId },
          });

          if (!existingEvent) {
            // Process the event - wrap order data in event format if needed
            const eventPayload = event.order || event;
            await this.processEvent(
              this.mapAllegroEventType(eventType),
              eventPayload
            );
            processedCount++;
          } else {
            this.logger.debug('Event already processed', { eventId });
          }

          // Track last event ID
          if (event.id || event.eventId) {
            lastOrderEventId = event.id || event.eventId;
          }
        }

        // Use lastEventId from response if available
        if (lastEventIdFromResponse) {
          lastOrderEventId = lastEventIdFromResponse;
        }
      } catch (error: any) {
        this.logger.error('Failed to poll order events', { error: error.message });
      }

      this.logger.log('Event polling completed', { processedCount });
      return { success: true, processedCount };
    } catch (error: any) {
      this.logger.error('Event polling failed', {
        error: error.message,
        processedCount,
      });
      throw error;
    }
  }

  /**
   * Map Allegro event type to internal event type
   */
  private mapAllegroEventType(allegroType: string): string {
    const mapping: Record<string, string> = {
      'OFFER_CREATED': 'offer.created',
      'OFFER_UPDATED': 'offer.updated',
      'OFFER_ENDED': 'offer.ended',
      'OFFER_STOCK_CHANGED': 'inventory.updated',
      'ORDER_CREATED': 'order.created',
      'ORDER_UPDATED': 'order.updated',
      'ORDER_PAID': 'order.updated',
      'ORDER_SENT': 'order.updated',
      'ORDER_CANCELLED': 'order.updated',
    };
    return mapping[allegroType] || allegroType.toLowerCase().replace(/_/g, '.');
  }

  /**
   * Process event (webhook or polled)
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
  async getEvents(query: any): Promise<{ items: any[]; pagination: any }> {
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
  async getEvent(id: string): Promise<any> {
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

