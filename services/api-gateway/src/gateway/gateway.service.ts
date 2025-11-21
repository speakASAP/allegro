/**
 * Gateway Service
 * Routes requests to appropriate microservices
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private readonly serviceUrls: Record<string, string>;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.serviceUrls = {
      products: this.configService.get<string>('PRODUCT_SERVICE_URL') || this.throwConfigError('PRODUCT_SERVICE_URL'),
      allegro: this.configService.get<string>('ALLEGRO_SERVICE_URL') || this.throwConfigError('ALLEGRO_SERVICE_URL'),
      sync: this.configService.get<string>('SYNC_SERVICE_URL') || this.throwConfigError('SYNC_SERVICE_URL'),
      webhooks: this.configService.get<string>('WEBHOOK_SERVICE_URL') || this.throwConfigError('WEBHOOK_SERVICE_URL'),
      import: this.configService.get<string>('IMPORT_SERVICE_URL') || this.throwConfigError('IMPORT_SERVICE_URL'),
      scheduler: this.configService.get<string>('SCHEDULER_SERVICE_URL') || this.throwConfigError('SCHEDULER_SERVICE_URL'),
    };
  }

  /**
   * Forward request to service
   */
  async forwardRequest(
    serviceName: string,
    path: string,
    method: string,
    body?: any,
    headers?: Record<string, string>,
  ): Promise<any> {
    const baseUrl = this.serviceUrls[serviceName];
    if (!baseUrl) {
      throw new Error(`Service ${serviceName} not configured`);
    }

    const url = `${baseUrl}${path}`;
    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: parseInt(this.configService.get<string>('GATEWAY_TIMEOUT') || this.configService.get<string>('HTTP_TIMEOUT') || '30000'),
    };

    this.logger.debug(`Forwarding ${method} ${url}`);

    try {
      let response;
      switch (method.toUpperCase()) {
        case 'GET':
          response = await firstValueFrom(this.httpService.get(url, config));
          break;
        case 'POST':
          response = await firstValueFrom(this.httpService.post(url, body, config));
          break;
        case 'PUT':
          response = await firstValueFrom(this.httpService.put(url, body, config));
          break;
        case 'DELETE':
          response = await firstValueFrom(this.httpService.delete(url, config));
          break;
        case 'PATCH':
          response = await firstValueFrom(this.httpService.patch(url, body, config));
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error forwarding request to ${serviceName}: ${error.message}`);
      throw error;
    }
  }

  private throwConfigError(key: string): never {
    throw new Error(`Missing required environment variable: ${key}. Please set it in your .env file.`);
  }
}

