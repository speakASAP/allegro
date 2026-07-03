/**
 * Allegro Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, LoggerModule, AuthModule, MetricsModule, ClientsModule, RabbitMQModule } from '@allegro/shared';
import { AllegroApiService } from './allegro-api.service';
import { AllegroAuthService } from './allegro-auth.service';
import { AllegroOAuthService } from './allegro-oauth.service';
import { OffersController } from './offers/offers.controller';
import { OffersService } from './offers/offers.service';
import { InternalOrderAffinityController, OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { InventoryService } from './inventory/inventory.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { OAuthController } from './oauth/oauth.controller';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { ProducersService } from './producers/producers.service';
import { PublishLifecycleService } from './publish-lifecycle/publish-lifecycle.service';
import { PublishLifecycleController } from './publish-lifecycle/publish-lifecycle.controller';
import { MarketplacePolicyEngineService } from './policy/policy-engine.service';
import { CatalogSellActionController } from './catalog-sell-action/catalog-sell-action.controller';
import { CatalogSellActionService } from './catalog-sell-action/catalog-sell-action.service';
import { AdminUsersController, AllegroUsersController } from './admin-users/admin-users.controller';
import { AdminUsersService } from './admin-users/admin-users.service';
import { OperationsController } from './operations/operations.controller';
import { OperationsService } from './operations/operations.service';
import { QuantityCommandsController } from './quantity-commands/quantity-commands.controller';
import { QuantityCommandsService } from './quantity-commands/quantity-commands.service';
import { CatalogProductEventsSubscriber } from './catalog-events/catalog-product-events.subscriber';
import { AvailabilityReconciliationService } from './availability-reconciliation/availability-reconciliation.service';

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
    ClientsModule,
    RabbitMQModule,
  ],
  controllers: [
    OffersController,
    OrdersController,
    InternalOrderAffinityController,
    CategoriesController,
    EventsController,
    OAuthController,
    ProductsController,
    PublishLifecycleController,
    CatalogSellActionController,
    AdminUsersController,
    AllegroUsersController,
    OperationsController,
    QuantityCommandsController,
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
    ProducersService,
    PublishLifecycleService,
    MarketplacePolicyEngineService,
    CatalogSellActionService,
    AdminUsersService,
    OperationsService,
    QuantityCommandsService,
    CatalogProductEventsSubscriber,
    AvailabilityReconciliationService,
  ],
  exports: [AllegroApiService, OffersService, OrdersService, CategoriesService, InventoryService, EventsService, PublishLifecycleService, MarketplacePolicyEngineService, CatalogSellActionService, AdminUsersService, OperationsService, QuantityCommandsService, CatalogProductEventsSubscriber, AvailabilityReconciliationService],
})
export class AllegroModule {}
