/**
 * Orders Controller
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '@allegro/shared';

@Controller('allegro/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getOrders(@Query() query: any) {
    const result = await this.ordersService.getOrders(query);
    return { success: true, data: result };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOrder(@Param('id') id: string) {
    const order = await this.ordersService.getOrder(id);
    return { success: true, data: order };
  }
}

