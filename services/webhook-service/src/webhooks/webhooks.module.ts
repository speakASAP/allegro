/**
 * Webhooks Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, LoggerModule, NotificationModule } from '@allegro/shared';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { OrderCreatedHandler } from './handlers/order-created.handler';
import { OrderUpdatedHandler } from './handlers/order-updated.handler';
import { OfferUpdatedHandler } from './handlers/offer-updated.handler';
import { InventoryUpdatedHandler } from './handlers/inventory-updated.handler';

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule, LoggerModule, NotificationModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    OrderCreatedHandler,
    OrderUpdatedHandler,
    OfferUpdatedHandler,
    InventoryUpdatedHandler,
  ],
})
export class WebhooksModule {}

