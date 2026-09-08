/**
 * Events Controller
 * Machine-facing event polling. Auth RS256 Bearer + least-privilege roles
 * per SERVICE_IDENTITY_CONSUMER_STANDARD.md — no unauthenticated internal path.
 */

import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { EventsService } from './events.service';

/** Read roles for offer/order event polling. Prefer service; admin for break-glass. */
const EVENTS_READ_ROLES: ReadonlySet<string> = new Set([
  'internal:allegro-service:service',
  'internal:allegro-service:admin',
]);

@Controller('allegro/events')
export class EventsController {
  private readonly authServiceUrl = (
    process.env.AUTH_SERVICE_URL || 'http://auth-microservice:3370'
  ).replace(/\/+$/, '');
  private readonly authValidateTimeoutMs = Number(
    process.env.AUTH_VALIDATE_TIMEOUT_MS || 3000,
  );

  constructor(private readonly eventsService: EventsService) {}

  @Get('offers')
  async getOfferEvents(
    @Query() query: { after?: string; limit?: number },
    @Headers('authorization') authorization?: string,
  ): Promise<{ success: boolean; data: any }> {
    await this.assertAuthServicePrincipal(authorization);
    const result = await this.eventsService.getOfferEvents(query.after, query.limit);
    return { success: true, data: result };
  }

  @Get('orders')
  async getOrderEvents(
    @Query() query: { after?: string; limit?: number },
    @Headers('authorization') authorization?: string,
  ): Promise<{ success: boolean; data: any }> {
    await this.assertAuthServicePrincipal(authorization);
    const result = await this.eventsService.getOrderEvents(query.after, query.limit);
    return { success: true, data: result };
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
    if (!roles.some((role) => EVENTS_READ_ROLES.has(role))) {
      throw new ForbiddenException('Principal lacks allegro events-read role');
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
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError') {
        throw new UnauthorizedException('Auth validate timeout');
      }
      throw new UnauthorizedException('Auth validate failed');
    }
    clearTimeout(timeout);

    if (!response.ok) {
      throw new UnauthorizedException('Invalid token');
    }
    const body = (await response.json()) as {
      valid?: boolean;
      user?: { roles?: unknown };
      roles?: unknown;
    };
    if (!body.valid) {
      throw new UnauthorizedException('Invalid token');
    }
    const roles = Array.isArray(body.user?.roles)
      ? body.user!.roles
      : Array.isArray(body.roles)
        ? body.roles
        : [];
    return roles.filter((r): r is string => typeof r === 'string');
  }
}
