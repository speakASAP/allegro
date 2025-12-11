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
    
    // Special timeout for bulk operations that may take longer
    const isBulkOperation = path.includes('/publish-all') || path.includes('/import') || path.includes('/bulk');
    const isPublishAll = path.includes('/publish-all');
    const defaultTimeout = (() => {
      const gatewayTimeout = this.configService.get<string>('GATEWAY_TIMEOUT');
      const httpTimeout = this.configService.get<string>('HTTP_TIMEOUT');
      const timeout = gatewayTimeout || httpTimeout;
      if (!timeout) {
        throw new Error('GATEWAY_TIMEOUT or HTTP_TIMEOUT must be configured in .env file');
      }
      return parseInt(timeout);
    })();
    
    // Use longer timeout for bulk operations
    // publish-all can take 5+ minutes for many offers (30 seconds per offer * 29 offers = ~14 minutes worst case)
    // Set to 10 minutes (600000ms) to be safe
    const timeout = isPublishAll ? 600000 : (isBulkOperation ? 120000 : defaultTimeout);
    
    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout,
      maxRedirects: followRedirects ? 5 : 0,
      validateStatus: (status) => status >= 200 && status < 400, // Accept redirects
    };

    // Log request details
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Log timeout configuration for debugging bulk operations
    if (isBulkOperation) {
      this.sharedLogger.log(`[${requestId}] Using extended timeout for bulk operation`, {
        path,
        timeout,
        isBulkOperation,
        defaultTimeout,
      });
    }
    
    this.sharedLogger.info(`[${requestId}] Forwarding request`, {
      serviceName,
      method,
      url,
      path,
      baseUrl,
      hasBody: !!body,
      bodySize: body ? JSON.stringify(body).length : 0,
      bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
      headers: Object.keys(headers || {}),
      authorizationHeader: headers?.Authorization ? 'present' : 'missing',
      timeout: config.timeout,
      isBulkOperation,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`[${requestId}] Forwarding ${method} ${url}`, {
      path,
      serviceName,
      timeout: config.timeout,
    });

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
      const responseData = response.data;
      const responseSize = JSON.stringify(responseData).length;
      const responseKeys = responseData && typeof responseData === 'object' ? Object.keys(responseData) : [];
      
      this.sharedLogger.info(`[${requestId}] Request successful`, {
        serviceName,
        method,
        url,
        path,
        statusCode: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        durationMs: duration,
        responseSize,
        responseSizeKB: Math.round(responseSize / 1024 * 100) / 100,
        responseKeys,
        hasData: !!responseData,
        dataType: responseData ? typeof responseData : 'null',
        isRedirect: response.status >= 300 && response.status < 400,
        location: response.headers?.location,
        responseHeaders: Object.keys(response.headers || {}),
        timestamp: new Date().toISOString(),
        throughput: responseSize > 0 ? `${Math.round((responseSize / duration) * 1000)} bytes/sec` : 'N/A',
      });
      this.logger.debug(`[${requestId}] ${method} ${url} - ${response.status} (${duration}ms)`, {
        responseSize,
        responseKeys: responseKeys.slice(0, 10), // First 10 keys
      });

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
      const errorResponse = error.response;
      const errorData = errorResponse?.data;
      const errorDetails = {
        serviceName,
        method,
        url,
        path,
        baseUrl,
        duration: `${duration}ms`,
        durationMs: duration,
        errorCode: error.code,
        errorMessage: error.message,
        errorName: error.name,
        errorStatus: errorResponse?.status,
        errorStatusText: errorResponse?.statusText,
        errorData: errorData ? (typeof errorData === 'object' ? JSON.stringify(errorData, null, 2) : String(errorData)) : null,
        errorDataKeys: errorData && typeof errorData === 'object' ? Object.keys(errorData) : [],
        errorResponseHeaders: errorResponse?.headers ? Object.keys(errorResponse.headers) : [],
        errorStack: error.stack,
        axiosError: error.isAxiosError,
        timeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
        connectionRefused: error.code === 'ECONNREFUSED',
        dnsError: error.code === 'ENOTFOUND',
        timedOut: error.code === 'ETIMEDOUT',
        configUrl: error.config?.url,
        configMethod: error.config?.method,
        configTimeout: error.config?.timeout,
        configHeaders: error.config?.headers ? Object.keys(error.config.headers) : [],
        timestamp: new Date().toISOString(),
        requestBody: body ? (typeof body === 'object' ? JSON.stringify(body, null, 2).substring(0, 1000) : String(body).substring(0, 1000)) : null,
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

