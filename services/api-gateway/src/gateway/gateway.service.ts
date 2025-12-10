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
    const getServiceUrl = (envVar: string, portEnvVar: string, serviceName?: string): string => {
      const url = this.configService.get<string>(envVar);
      const port = this.configService.get<string>(portEnvVar);
      
      if (url && isDevelopment && url.includes('-service')) {
        // Replace Docker service hostname with localhost in development
        const extractedPort = url.match(/:(\d+)/)?.[1] || port;
        if (extractedPort) {
          return `http://localhost:${extractedPort}`;
        }
      }
      
      if (url) {
        return url;
      }
      
      // If no URL but we have a port, construct localhost URL
      if (port) {
        return `http://localhost:${port}`;
      }
      
      // If service name provided, require configuration
      if (serviceName) {
        this.throwConfigError(`${envVar} or ${portEnvVar}`);
      }
      
      // Fallback (should not happen if serviceName is provided)
      return '';
    };

    this.serviceUrls = {
      allegro: getServiceUrl('ALLEGRO_SERVICE_URL', 'ALLEGRO_SERVICE_PORT', 'allegro'),
      import: getServiceUrl('IMPORT_SERVICE_URL', 'IMPORT_SERVICE_PORT', 'import'),
      settings: getServiceUrl('SETTINGS_SERVICE_URL', 'ALLEGRO_SETTINGS_SERVICE_PORT', 'settings'),
      // In development, use localhost (via SSH tunnel) if AUTH_SERVICE_PORT is set or AUTH_SERVICE_URL is localhost
      // Otherwise fallback to AUTH_SERVICE_URL (HTTPS for production)
      auth: isDevelopment 
        ? (this.configService.get<string>('AUTH_SERVICE_PORT') 
            ? `http://localhost:${this.configService.get<string>('AUTH_SERVICE_PORT')}`
            : (this.configService.get<string>('AUTH_SERVICE_URL')?.startsWith('http://localhost')
                ? this.configService.get<string>('AUTH_SERVICE_URL')
                : (this.configService.get<string>('AUTH_SERVICE_URL') || this.throwConfigError('AUTH_SERVICE_URL'))))
        : (this.configService.get<string>('AUTH_SERVICE_URL') || this.throwConfigError('AUTH_SERVICE_URL')),
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
   * Returns response data and status code, or full response object if redirect
   */
  async forwardRequest(
    serviceName: string,
    path: string,
    method: string,
    body?: any,
    headers?: Record<string, string>,
    followRedirects: boolean = true,
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
      timeout: (() => {
        const gatewayTimeout = this.configService.get<string>('GATEWAY_TIMEOUT');
        const httpTimeout = this.configService.get<string>('HTTP_TIMEOUT');
        const timeout = gatewayTimeout || httpTimeout;
        if (!timeout) {
          throw new Error('GATEWAY_TIMEOUT or HTTP_TIMEOUT must be configured in .env file');
        }
        return parseInt(timeout);
      })(),
      maxRedirects: followRedirects ? 5 : 0,
      validateStatus: (status) => status >= 200 && status < 400, // Accept redirects
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
        isRedirect: response.status >= 300 && response.status < 400,
        location: response.headers?.location,
      });
      this.logger.debug(`[${requestId}] ${method} ${url} - ${response.status} (${duration}ms)`);

      // If it's a redirect, return the full response object
      if (response.status >= 300 && response.status < 400) {
        return {
          _isRedirect: true,
          status: response.status,
          location: response.headers?.location,
          headers: response.headers,
        };
      }

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

