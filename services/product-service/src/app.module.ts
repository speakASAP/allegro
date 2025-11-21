/**
 * Product Service App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module';
import { PrismaModule, LoggerModule, HealthModule } from '@allegro/shared';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    PrismaModule,
    LoggerModule,
    HealthModule,
    ProductsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

