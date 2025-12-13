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
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private readonly sharedLogger: LoggerService;
  private readonly serviceUrls: Record<string, string>;
  private readonly httpAgent: HttpAgent;
  private readonly httpsAgent: HttpsAgent;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    // Create HTTP and HTTPS agents with keep-alive to reuse connections
    // These are shared across all requests to eliminate connection delays
    const agentStartTime = Date.now();
    this.httpAgent = new HttpAgent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
    });
    
    this.httpsAgent = new HttpsAgent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
    });
    
    // Set agents on the HttpService's Axios instance defaults
    // This ensures all requests use keep-alive agents
    this.httpService.axiosRef.defaults.httpAgent = this.httpAgent;
    this.httpService.axiosRef.defaults.httpsAgent = this.httpsAgent;
    
    this.sharedLogger = loggerService;
    this.sharedLogger.setContext('GatewayService');
    
    // Log agent creation and configuration
    const agentCreationTime = Date.now() - agentStartTime;
    const agentConfig = {
      httpAgentMaxSockets: this.httpAgent.maxSockets,
      httpAgentMaxFreeSockets: this.httpAgent.maxFreeSockets,
      httpsAgentMaxSockets: this.httpsAgent.maxSockets,
      httpsAgentMaxFreeSockets: this.httpsAgent.maxFreeSockets,
      axiosDefaultsHttpAgent: !!this.httpService.axiosRef.defaults.httpAgent,
      axiosDefaultsHttpsAgent: !!this.httpService.axiosRef.defaults.httpsAgent,
    };
    console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: Agents created (${agentCreationTime}ms)`, agentConfig);
    this.sharedLogger.info(`[${new Date().toISOString()}] [TIMING] GatewayService: Agents created (${agentCreationTime}ms)`, agentConfig);
    
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
    
    // Determine if URL is HTTPS or HTTP to use correct agent
    const isHttps = url.startsWith('https://');
    
    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout,
      maxRedirects: followRedirects ? 5 : 0,
      validateStatus: (status) => status >= 200 && status < 400, // Accept redirects
      // Explicitly use keep-alive agents to reuse connections
      // This eliminates the 17-second delay on first connection
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
    };

    // Log request details
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Log agent usage and connection details for debugging
    const agentCheckTime = Date.now();
    const agentInfo = {
      hasHttpAgent: !!config.httpAgent,
      hasHttpsAgent: !!config.httpsAgent,
      isHttps,
      httpAgentSockets: this.httpAgent.sockets,
      httpAgentFreeSockets: this.httpAgent.freeSockets,
      httpAgentRequests: this.httpAgent.requests,
      httpsAgentSockets: this.httpsAgent.sockets,
      httpsAgentFreeSockets: this.httpsAgent.freeSockets,
      httpsAgentRequests: this.httpsAgent.requests,
      axiosDefaultsHttpAgent: !!this.httpService.axiosRef.defaults.httpAgent,
      axiosDefaultsHttpsAgent: !!this.httpService.axiosRef.defaults.httpsAgent,
    };
    console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: Agent check (${Date.now() - agentCheckTime}ms) for ${url}`, agentInfo);
    this.logger.debug(`[${requestId}] Using keep-alive agents for ${url}`, agentInfo);
    
    // Log timeout configuration for debugging bulk operations
    if (isBulkOperation) {
      this.sharedLogger.log(`[${requestId}] Using extended timeout for bulk operation`, {
        path,
        timeout,
        isBulkOperation,
        defaultTimeout,
        isPublishAll,
      });
    }
    
    // Enhanced logging for publish-all requests
    if (isPublishAll) {
      this.sharedLogger.log(`[${requestId}] ========== GATEWAY: PUBLISH-ALL REQUEST ==========`, {
        serviceName,
        method,
        url,
        path,
        baseUrl,
        hasBody: !!body,
        bodySize: body ? JSON.stringify(body).length : 0,
        bodyContent: body ? JSON.stringify(body, null, 2) : null,
        bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
        offerIdsCount: body?.offerIds?.length || 0,
        offerIds: body?.offerIds || [],
        headers: Object.keys(headers || {}),
        authorizationHeader: headers?.Authorization ? 'present' : 'missing',
        timeout: config.timeout,
        timeoutSeconds: Math.round(config.timeout / 1000),
        isBulkOperation,
        isPublishAll,
        timestamp: new Date().toISOString(),
        step: 'GATEWAY_FORWARD_START',
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
      isPublishAll,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`[${requestId}] Forwarding ${method} ${url}`, {
      path,
      serviceName,
      timeout: config.timeout,
    });

    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [TIMING] GatewayService.forwardRequest START`, {
      requestId,
      serviceName,
      method,
      url,
      path,
      configTimeout: config.timeout,
      configHasHttpAgent: !!config.httpAgent,
      configHasHttpsAgent: !!config.httpsAgent,
    });
    this.sharedLogger.log(`[${timestamp}] [TIMING] GatewayService.forwardRequest START`, {
      requestId,
      serviceName,
      method,
      url,
      path,
      configTimeout: config.timeout,
      configHasHttpAgent: !!config.httpAgent,
      configHasHttpsAgent: !!config.httpsAgent,
    });
    
    const axiosCallStartTime = Date.now();
    try {
      let response;
      const axiosMethodStartTime = Date.now();
      console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: About to call Axios ${method} ${url}`, {
        requestId,
        timeSinceRequestStart: axiosMethodStartTime - startTime,
      });
      
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

      const axiosCallDuration = Date.now() - axiosCallStartTime;
      const duration = Date.now() - startTime;
      const responseData = response.data;
      const responseSize = JSON.stringify(responseData).length;
      const responseKeys = responseData && typeof responseData === 'object' ? Object.keys(responseData) : [];
      
      // Log agent status after request
      const postRequestAgentInfo = {
        httpAgentSockets: Object.keys(this.httpAgent.sockets || {}).length,
        httpAgentFreeSockets: Object.keys(this.httpAgent.freeSockets || {}).length,
        httpAgentRequests: Object.keys(this.httpAgent.requests || {}).length,
        httpsAgentSockets: Object.keys(this.httpsAgent.sockets || {}).length,
        httpsAgentFreeSockets: Object.keys(this.httpsAgent.freeSockets || {}).length,
        httpsAgentRequests: Object.keys(this.httpsAgent.requests || {}).length,
      };
      
      console.log(`[${new Date().toISOString()}] [TIMING] GatewayService.forwardRequest COMPLETE (${duration}ms total, axios: ${axiosCallDuration}ms)`, {
        requestId,
        serviceName,
        method,
        url,
        path,
        statusCode: response.status,
        durationMs: duration,
        axiosCallDurationMs: axiosCallDuration,
        ...postRequestAgentInfo,
      });
      
      this.sharedLogger.log(`[${new Date().toISOString()}] [TIMING] GatewayService.forwardRequest COMPLETE (${duration}ms total, axios: ${axiosCallDuration}ms)`, {
        requestId,
        serviceName,
        method,
        url,
        path,
        statusCode: response.status,
        durationMs: duration,
        axiosCallDurationMs: axiosCallDuration,
        ...postRequestAgentInfo,
      });
      
      // Enhanced logging for publish-all responses
      if (isPublishAll) {
        this.sharedLogger.log(`[${requestId}] ========== GATEWAY: PUBLISH-ALL RESPONSE ==========`, {
          serviceName,
          method,
          url,
          path,
          statusCode: response.status,
          statusText: response.statusText,
          duration: `${duration}ms`,
          durationSeconds: Math.round(duration / 1000),
          responseSize,
          responseSizeKB: Math.round(responseSize / 1024 * 100) / 100,
          responseKeys,
          hasData: !!responseData,
          success: responseData?.success,
          total: responseData?.data?.total,
          successful: responseData?.data?.successful,
          failed: responseData?.data?.failed,
          responsePreview: responseData ? JSON.stringify(responseData, null, 2).substring(0, 2000) : null,
          timestamp: new Date().toISOString(),
          step: 'GATEWAY_FORWARD_COMPLETE',
        });
      }
      
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
        isPublishAll,
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
      const axiosCallDuration = Date.now() - axiosCallStartTime;
      const duration = Date.now() - startTime;
      const errorResponse = error.response;
      const errorData = errorResponse?.data;
      
      // Log agent status on error
      const errorAgentInfo = {
        httpAgentSockets: Object.keys(this.httpAgent.sockets || {}).length,
        httpAgentFreeSockets: Object.keys(this.httpAgent.freeSockets || {}).length,
        httpAgentRequests: Object.keys(this.httpAgent.requests || {}).length,
        httpsAgentSockets: Object.keys(this.httpsAgent.sockets || {}).length,
        httpsAgentFreeSockets: Object.keys(this.httpsAgent.freeSockets || {}).length,
        httpsAgentRequests: Object.keys(this.httpsAgent.requests || {}).length,
      };
      
      console.error(`[${new Date().toISOString()}] [TIMING] GatewayService.forwardRequest ERROR (${duration}ms total, axios: ${axiosCallDuration}ms)`, {
        requestId,
        serviceName,
        method,
        url,
        path,
        errorMessage: error.message,
        errorCode: error.code,
        errorName: error.name,
        durationMs: duration,
        axiosCallDurationMs: axiosCallDuration,
        ...errorAgentInfo,
      });
      
      // Enhanced logging for publish-all errors
      if (isPublishAll) {
        this.sharedLogger.error(`[${requestId}] ========== GATEWAY: PUBLISH-ALL ERROR ==========`, {
          serviceName,
          method,
          url,
          path,
          baseUrl,
          error: error.message,
          errorCode: error.code,
          status: errorResponse?.status,
          statusText: errorResponse?.statusText,
          duration: `${duration}ms`,
          durationSeconds: Math.round(duration / 1000),
          isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
          errorData: JSON.stringify(errorData, null, 2),
          errorResponseKeys: errorData && typeof errorData === 'object' ? Object.keys(errorData) : [],
          errorStack: error.stack,
          timestamp: new Date().toISOString(),
          step: 'GATEWAY_FORWARD_ERROR',
        });
      }
      
      const errorDetails = {
        serviceName,
        method,
        url,
        path,
        baseUrl,
        duration: `${duration}ms`,
        durationMs: duration,
        isPublishAll,
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

