/**
 * Orders Controller
 */

import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '@allegro/shared';

const ORDER_AFFINITY_REPLAY_ROLES: ReadonlySet<string> = new Set([
  'internal:allegro-service:order-affinity',
]);

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
  private readonly authServiceUrl = (
    process.env.AUTH_SERVICE_URL || 'http://auth-microservice:3370'
  ).replace(/\/+$/, '');
  private readonly authValidateTimeoutMs = Number(
    process.env.AUTH_VALIDATE_TIMEOUT_MS || 3000,
  );

  constructor(private readonly ordersService: OrdersService) {}

  @Get('replay-candidates')
  async getReplayCandidates(
    @Query() query: any,
    @Headers('authorization') authorization?: string,
  ): Promise<{ success: boolean; data: any }> {
    await this.assertAuthServicePrincipal(authorization);
    const data = await this.ordersService.getOrderAffinityReplayCandidates(query);
    return { success: true, data };
  }

  private async assertAuthServicePrincipal(authorization?: string): Promise<void> {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const roles = await this.validateRoles(token);
    if (!roles.some((role) => ORDER_AFFINITY_REPLAY_ROLES.has(role))) {
      throw new ForbiddenException('Principal lacks order-affinity role');
    }
  }

  private async validateRoles(token: string): Promise<string[]> {
    const controller = new AbortController();
    const timeoutMs =
      Number.isFinite(this.authValidateTimeoutMs) && this.authValidateTimeoutMs > 0
        ? this.authValidateTimeoutMs
        : 3000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.authServiceUrl}/auth/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'allegro_order_affinity_auth_validate_unreachable',
          message: 'Auth validate unreachable during Allegro order-affinity replay',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new UnauthorizedException('Invalid token');
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new UnauthorizedException('Invalid token');
    }

    let data: { valid?: boolean; user?: { roles?: unknown } };
    try {
      data = (await response.json()) as { valid?: boolean; user?: { roles?: unknown } };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!data.valid || !data.user) {
      throw new UnauthorizedException('Invalid token');
    }

    return Array.isArray(data.user.roles)
      ? data.user.roles.filter((role): role is string => typeof role === 'string')
      : [];
  }
}
