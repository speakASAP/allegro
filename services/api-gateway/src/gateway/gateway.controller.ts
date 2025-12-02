/**
 * Gateway Controller
 * Routes all API requests to appropriate microservices
 */

import {
  Controller,
  All,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { GatewayService } from './gateway.service';
import { JwtAuthGuard } from '@allegro/shared';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';

@Controller('api')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  /**
   * Route product requests
   * Handle both /api/products and /api/products/*
   */
  @All(['products', 'products/*'])
  async productsRoute(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const path = req.url.replace('/api/products', '') || '';
    return this.routeRequest('products', `/products${path}`, req, res);
  }

  /**
   * Route allegro requests (requires auth)
   */
  @All('allegro/*')
  @UseGuards(JwtAuthGuard)
  async allegroRoute(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const path = req.url.replace('/api/allegro', '');
    return this.routeRequest('allegro', `/allegro${path}`, req, res);
  }

  /**
   * Route sync requests (requires auth)
   */
  @All('sync/*')
  @UseGuards(JwtAuthGuard)
  async syncRoute(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const path = req.url.replace('/api/sync', '');
    return this.routeRequest('sync', `/sync${path}`, req, res);
  }

  /**
   * Route webhook requests (no auth - webhook secret validation)
   */
  @All('webhooks/*')
  async webhooksRoute(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const path = req.url.replace('/api/webhooks', '');
    return this.routeRequest('webhooks', `/webhooks${path}`, req, res);
  }

  /**
   * Route import requests (requires auth)
   */
  @All('import/*')
  @UseGuards(JwtAuthGuard)
  async importRoute(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const path = req.url.replace('/api/import', '');
    return this.routeRequest('import', `/import${path}`, req, res);
  }

  /**
   * Route settings requests (requires auth)
   * Handle both /api/settings and /api/settings/*
   */
  @All('settings')
  @UseGuards(JwtAuthGuard)
  async settingsBaseRoute(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const path = req.url.replace('/api/settings', '') || '';
    return this.routeRequest('settings', `/settings${path}`, req, res);
  }

  @All('settings/*')
  @UseGuards(JwtAuthGuard)
  async settingsRoute(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const path = req.url.replace('/api/settings', '');
    return this.routeRequest('settings', `/settings${path}`, req, res);
  }

  /**
   * Route auth requests (no auth required for register/login)
   */
  @All('auth/*')
  async authRoute(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const path = req.url.replace('/api/auth', '');
    return this.routeRequest('auth', `/auth${path}`, req, res);
  }

  /**
   * Helper to route request
   */
  private async routeRequest(
    serviceName: string,
    path: string,
    req: ExpressRequest,
    res: ExpressResponse,
  ) {
    const method = req.method;
    const body = method !== 'GET' && method !== 'DELETE' ? req.body : undefined;

    try {
      const response = await this.gatewayService.forwardRequest(
        serviceName,
        path,
        method,
        body,
        this.getHeaders(req),
      );
      res.status(200).json(response);
    } catch (error: any) {
      // Handle UnauthorizedException properly
      if (error instanceof UnauthorizedException) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: error.message || 'Authentication required',
          },
        });
        return;
      }

      // Handle timeout errors (auth service unreachable)
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: `Unable to reach ${serviceName} service. Please check if the service is running and accessible.`,
          },
        });
        return;
      }

      // Handle connection errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: `Cannot connect to ${serviceName} service. Please check network connectivity and service configuration.`,
          },
        });
        return;
      }

      // Handle 409 Conflict (user already exists, etc.)
      if (error.response?.status === 409) {
        res.status(409).json({
          success: false,
          error: {
            code: error.response?.data?.error?.code || 'CONFLICT',
            message: error.response?.data?.error?.message || error.response?.data?.message || 'Resource already exists',
          },
        });
        return;
      }

      // Handle other errors
      const statusCode = error.response?.status || error.status || 500;
      res.status(statusCode).json({
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'GATEWAY_ERROR',
          message: error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Internal server error',
        },
      });
    }
  }

  /**
   * Get headers from request
   */
  private getHeaders(req: ExpressRequest): Record<string, string> {
    const headers: Record<string, string> = {};

    // Forward authorization header
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    // Forward user ID if available from JWT guard
    if ((req as any).user?.id) {
      headers['X-User-Id'] = (req as any).user.id;
    }

    return headers;
  }
}

