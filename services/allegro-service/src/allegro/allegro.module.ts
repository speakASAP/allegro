/**
 * Allegro Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, LoggerModule, AuthModule } from '@allegro/shared';
import { AllegroApiService } from './allegro-api.service';
import { AllegroAuthService } from './allegro-auth.service';
import { OffersController } from './offers/offers.controller';
import { OffersService } from './offers/offers.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { InventoryService } from './inventory/inventory.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule, LoggerModule, AuthModule],
  controllers: [
    OffersController,
    OrdersController,
    CategoriesController,
    EventsController,
  ],
  providers: [
    AllegroApiService,
    AllegroAuthService,
    OffersService,
    OrdersService,
    CategoriesService,
    InventoryService,
    EventsService,
  ],
  exports: [AllegroApiService, OffersService, OrdersService, CategoriesService, InventoryService, EventsService],
})
export class AllegroModule {}

