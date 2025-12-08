/**
 * Gateway Service
 * Routes requests to appropriate microservices
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { LoggerService } from '@allegro/shared';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private readonly sharedLogger: LoggerService;
  private readonly serviceUrls: Record<string, string>;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    this.sharedLogger = loggerService;
    this.sharedLogger.setContext('GatewayService');
    
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    const isDevelopment = nodeEnv === 'development';
    
    // Helper to convert Docker hostnames to localhost in development
    const getServiceUrl = (envVar: string, defaultPort: string, serviceName?: string): string => {
      const url = this.configService.get<string>(envVar);
      if (url && isDevelopment && url.includes('-service')) {
        // Replace Docker service hostname with localhost in development
        const port = url.match(/:(\d+)/)?.[1] || defaultPort;
        return `http://localhost:${port}`;
      }
      return url || (serviceName ? this.throwConfigError(envVar) : `http://localhost:${defaultPort}`);
    };

    this.serviceUrls = {
      allegro: getServiceUrl('ALLEGRO_SERVICE_URL', process.env.ALLEGRO_SERVICE_PORT || '3403'),
      import: getServiceUrl('IMPORT_SERVICE_URL', process.env.IMPORT_SERVICE_PORT || '3406'),
      settings: getServiceUrl('SETTINGS_SERVICE_PORT', process.env.ALLEGRO_SETTINGS_SERVICE_PORT || '3408'),
      auth: this.configService.get<string>('AUTH_SERVICE_URL') || this.throwConfigError('AUTH_SERVICE_URL'),
    };

    // Log all service URLs at startup
    this.sharedLogger.info('API Gateway initialized with service URLs', {
      serviceUrls: this.serviceUrls,
      nodeEnv,
      isDevelopment,
    });
    this.logger.log('Service URLs configured:');
    this.logger.log(JSON.stringify(this.serviceUrls, null, 2));
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
      timeout: parseInt(this.configService.get<string>('GATEWAY_TIMEOUT') || this.configService.get<string>('HTTP_TIMEOUT') || '10000'),
    };

    // Log request details
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sharedLogger.info(`[${requestId}] Forwarding request`, {
      serviceName,
      method,
      url,
      path,
      baseUrl,
      hasBody: !!body,
      headers: Object.keys(headers || {}),
      timeout: config.timeout,
    });
    this.logger.debug(`[${requestId}] Forwarding ${method} ${url}`);

    const startTime = Date.now();
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

      const duration = Date.now() - startTime;
      this.sharedLogger.info(`[${requestId}] Request successful`, {
        serviceName,
        method,
        url,
        statusCode: response.status,
        duration: `${duration}ms`,
        responseSize: JSON.stringify(response.data).length,
      });
      this.logger.debug(`[${requestId}] ${method} ${url} - ${response.status} (${duration}ms)`);

      return response.data;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorDetails = {
        serviceName,
        method,
        url,
        path,
        baseUrl,
        duration: `${duration}ms`,
        errorCode: error.code,
        errorMessage: error.message,
        errorStatus: error.response?.status,
        errorStatusText: error.response?.statusText,
        errorData: error.response?.data,
        errorStack: error.stack,
        axiosError: error.isAxiosError,
        timeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
        connectionRefused: error.code === 'ECONNREFUSED',
        dnsError: error.code === 'ENOTFOUND',
        timedOut: error.code === 'ETIMEDOUT',
      };

      this.sharedLogger.error(`[${requestId}] Error forwarding request to ${serviceName}`, errorDetails);
      this.logger.error(`[${requestId}] Error forwarding request to ${serviceName}: ${error.message}`, errorDetails);
      
      throw error;
    }
  }

  private throwConfigError(key: string): never {
    throw new Error(`Missing required environment variable: ${key}. Please set it in your .env file.`);
  }
}

