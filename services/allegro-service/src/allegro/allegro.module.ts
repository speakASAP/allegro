/**
 * Allegro Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, LoggerModule, AuthModule, MetricsModule } from '@allegro/shared';
import { AllegroApiService } from './allegro-api.service';
import { AllegroAuthService } from './allegro-auth.service';
import { AllegroOAuthService } from './allegro-oauth.service';
import { OffersController } from './offers/offers.controller';
import { OffersService } from './offers/offers.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { InventoryService } from './inventory/inventory.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { OAuthController } from './oauth/oauth.controller';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';

@Module({
  imports: [
    HttpModule.register({
      // Don't set global timeout - let each request configure its own timeout
      // Global timeout can conflict with per-request timeouts
      maxRedirects: 5,
    }),
    ConfigModule,
    PrismaModule,
    LoggerModule,
    AuthModule,
    MetricsModule,
  ],
  controllers: [
    OffersController,
    OrdersController,
    CategoriesController,
    EventsController,
    OAuthController,
    ProductsController,
  ],
  providers: [
    AllegroApiService,
    AllegroAuthService,
    AllegroOAuthService,
    OffersService,
    OrdersService,
    CategoriesService,
    InventoryService,
    EventsService,
    ProductsService,
  ],
  exports: [AllegroApiService, OffersService, OrdersService, CategoriesService, InventoryService, EventsService],
})
export class AllegroModule {}

