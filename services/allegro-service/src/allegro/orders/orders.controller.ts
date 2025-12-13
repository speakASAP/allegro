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
  async getOrders(@Query() query: any): Promise<{ success: boolean; data: any }> {
    const controllerStartTime = Date.now();
    const timestamp = new Date().toISOString();
    // Note: LoggerService needs to be injected to use logger here
    console.log(`[${timestamp}] [TIMING] OrdersController.getOrders START - Request received at controller`);
    
    const serviceStartTime = Date.now();
    const result = await this.ordersService.getOrders(query);
    const serviceDuration = Date.now() - serviceStartTime;
    const totalDuration = Date.now() - controllerStartTime;
    
    console.log(`[${new Date().toISOString()}] [TIMING] OrdersController.getOrders COMPLETE (${totalDuration}ms total, service: ${serviceDuration}ms)`, {
      totalDurationMs: totalDuration,
      serviceDurationMs: serviceDuration,
    });
    
    return { success: true, data: result };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOrder(@Param('id') id: string): Promise<{ success: boolean; data: any }> {
    const order = await this.ordersService.getOrder(id);
    return { success: true, data: order };
  }
}

