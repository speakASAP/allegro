/**
 * Gateway Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}

