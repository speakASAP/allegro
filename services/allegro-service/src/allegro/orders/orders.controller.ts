/**
 * Orders Controller
 */

import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '@allegro/shared';

@Controller('allegro/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getOrders(@Query() query: any, @Req() req: { user?: any }): Promise<{ success: boolean; data: any }> {
    const controllerStartTime = Date.now();
    const timestamp = new Date().toISOString();
    // Note: LoggerService needs to be injected to use logger here
    console.log(`[${timestamp}] [TIMING] OrdersController.getOrders START - Request received at controller`);
    
    const serviceStartTime = Date.now();
    const result = await this.ordersService.getOrders(query, req.user || {});
    const serviceDuration = Date.now() - serviceStartTime;
    const totalDuration = Date.now() - controllerStartTime;
    
    console.log(`[${new Date().toISOString()}] [TIMING] OrdersController.getOrders COMPLETE (${totalDuration}ms total, service: ${serviceDuration}ms)`, {
      totalDurationMs: totalDuration,
      serviceDurationMs: serviceDuration,
    });
    
    return { success: true, data: result };
  }

  @Get("statistics")
  @UseGuards(JwtAuthGuard)
  async getOrderStatistics(@Query() query: any, @Req() req: { user?: any }): Promise<{ success: boolean; data: any }> {
    const statistics = await this.ordersService.getOrderStatistics(query, req.user || {});
    return { success: true, data: statistics };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOrder(@Param('id') id: string, @Req() req: { user?: any }): Promise<{ success: boolean; data: any }> {
    const order = await this.ordersService.getOrder(id, req.user || {});
    return { success: true, data: order };
  }
}

@Controller('allegro/buyer/orders')
export class BuyerOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getBuyerOrders(@Query() query: any, @Req() req: { user?: any }): Promise<{ success: boolean; data: any }> {
    const result = await this.ordersService.getBuyerOrders(query, req.user || {});
    return { success: true, data: result };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getBuyerOrder(@Param('id') id: string, @Req() req: { user?: any }): Promise<{ success: boolean; data: any }> {
    const order = await this.ordersService.getBuyerOrder(id, req.user || {});
    return { success: true, data: order };
  }
}

@Controller('internal/allegro/order-affinity')
export class InternalOrderAffinityController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  @Get('replay-candidates')
  async getReplayCandidates(
    @Query() query: any,
    @Headers('x-internal-service-token') token?: string,
    @Headers('x-service-name') serviceName?: string,
  ): Promise<{ success: boolean; data: any }> {
    this.assertMarketingService(token, serviceName);
    const data = await this.ordersService.getOrderAffinityReplayCandidates(query);
    return { success: true, data };
  }

  private assertMarketingService(token?: string, serviceName?: string): void {
    const expected = (
      this.configService.get<string>('ALLEGRO_INTERNAL_SERVICE_TOKEN')
      || this.configService.get<string>('INTERNAL_SERVICE_TOKEN')
      || ''
    ).trim();
    const supplied = String(token || '').replace(/^Bearer\s+/i, '').trim();
    if (!expected || !supplied || supplied !== expected || serviceName !== 'marketing-microservice') {
      throw new UnauthorizedException('internal_service_auth_required');
    }
  }
}
