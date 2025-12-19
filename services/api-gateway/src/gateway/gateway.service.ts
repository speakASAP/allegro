/**
 * Gateway Service
 * Routes requests to appropriate microservices
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { LoggerService } from '@allegro/shared';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

@Injectable()
export class GatewayService implements OnModuleInit {
  private readonly logger = new Logger(GatewayService.name);
  private readonly sharedLogger: LoggerService;
  private readonly serviceUrls: Record<string, string>;
  private readonly httpAgent: HttpAgent;
  private readonly httpsAgent: HttpsAgent;
  // Fresh agents without keep-alive - shared across all requests to avoid connection reuse issues
  // Creating new agents per request was causing delays, so we use shared agents without keep-alive
  private readonly freshHttpAgent: HttpAgent;
  private readonly freshHttpsAgent: HttpsAgent;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    // Use the agents from HttpModule configuration (created in GatewayModule)
    // These are already configured with keep-alive and connection pooling
    const agentStartTime = Date.now();
    
    // Get agents from HttpModule if they exist, otherwise create new ones
    const existingHttpAgent = this.httpService.axiosRef.defaults.httpAgent as HttpAgent;
    const existingHttpsAgent = this.httpService.axiosRef.defaults.httpsAgent as HttpsAgent;
    
    // Create agents with aggressive keep-alive settings to prevent connection delays
    // maxFreeSockets increased to 20 to keep more connections ready for instant reuse
    this.httpAgent = existingHttpAgent || new HttpAgent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 20, // Keep more idle connections ready
      timeout: 60000,
      scheduling: 'fifo', // Reuse oldest connections first
    });
    
    this.httpsAgent = existingHttpsAgent || new HttpsAgent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 20, // Keep more idle connections ready
      timeout: 60000,
      scheduling: 'fifo', // Reuse oldest connections first
    });
    
    // Create optimized agents with shorter idle timeout to prevent stale connections
    // These will be reused across requests for better performance
    // Key optimization: timeout is socket timeout (how long to wait for response), not connection establishment
    // Increased timeout to 10s to allow for slower connections while still failing reasonably fast
    // freeSocketTimeout (4s) closes idle sockets quickly to prevent stale connections
    // Note: freeSocketTimeout is a valid Node.js property but not in TypeScript types, using type assertion
    this.optimizedHttpAgent = new HttpAgent({
      keepAlive: true,
      keepAliveMsecs: 1000, // Send keep-alive packets every 1 second
      maxSockets: 50,
      maxFreeSockets: 20, // Increased to keep more connections ready for reuse
      timeout: 10000, // Socket timeout: 10 seconds (allow time for connection establishment and response)
      scheduling: 'fifo',
      freeSocketTimeout: 4000, // Close idle sockets after 4 seconds to prevent stale connections
    } as any); // Type assertion needed as freeSocketTimeout is not in TypeScript types but exists in Node.js
    
    this.optimizedHttpsAgent = new HttpsAgent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 20, // Increased to keep more connections ready
      timeout: 10000, // Socket timeout: 10 seconds
      scheduling: 'fifo',
      freeSocketTimeout: 4000, // Close idle sockets after 4 seconds
    } as any); // Type assertion needed as freeSocketTimeout is not in TypeScript types but exists in Node.js
    
    // Ensure agents are set on the HttpService's Axios instance defaults
    // Set default agents, but individual requests can override them
    this.httpService.axiosRef.defaults.httpAgent = this.httpAgent;
    this.httpService.axiosRef.defaults.httpsAgent = this.httpsAgent;
    
    // Add request interceptor to log when Axios actually sends the request
    this.httpService.axiosRef.interceptors.request.use(
      (config) => {
        const configAny = config as any;
        const requestId = configAny.metadata?.requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();
        const url = config.url || '';
        const method = config.method?.toUpperCase() || 'UNKNOWN';
        
        // Store request start time in config metadata
        if (!configAny.metadata) {
          configAny.metadata = {};
        }
        configAny.metadata.requestId = requestId;
        configAny.metadata.requestStartTime = Date.now();
        configAny.metadata.requestStartTimestamp = timestamp;
        
        console.log(`[${timestamp}] [TIMING] Axios Request Interceptor: Request being sent`, {
          requestId,
          method,
          url: config.baseURL ? `${config.baseURL}${url}` : url,
          fullUrl: config.url,
          baseURL: config.baseURL,
          hasHttpAgent: !!config.httpAgent,
          hasHttpsAgent: !!config.httpsAgent,
          httpAgentSockets: this.httpAgent.sockets ? Object.keys(this.httpAgent.sockets).length : 0,
          httpAgentFreeSockets: this.httpAgent.freeSockets ? Object.keys(this.httpAgent.freeSockets).length : 0,
          httpAgentRequests: this.httpAgent.requests ? Object.keys(this.httpAgent.requests).length : 0,
          httpsAgentSockets: this.httpsAgent.sockets ? Object.keys(this.httpsAgent.sockets).length : 0,
          httpsAgentFreeSockets: this.httpsAgent.freeSockets ? Object.keys(this.httpsAgent.freeSockets).length : 0,
          httpsAgentRequests: this.httpsAgent.requests ? Object.keys(this.httpsAgent.requests).length : 0,
        });
        this.sharedLogger.log(`[${timestamp}] [TIMING] Axios Request Interceptor: Request being sent`, {
          requestId,
          method,
          url: config.baseURL ? `${config.baseURL}${url}` : url,
        });
        
        return config;
      },
      (error) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [TIMING] Axios Request Interceptor: Error`, {
          error: error.message,
          errorCode: error.code,
        });
        this.sharedLogger.error(`[${timestamp}] [TIMING] Axios Request Interceptor: Error`, {
          error: error.message,
          errorCode: error.code,
        });
        return Promise.reject(error);
      },
    );
    
    // Add response interceptor to log when Axios receives the response
    this.httpService.axiosRef.interceptors.response.use(
      (response) => {
        const configAny = response.config as any;
        const requestId = configAny.metadata?.requestId || 'unknown';
        const requestStartTime = configAny.metadata?.requestStartTime;
        const timestamp = new Date().toISOString();
        const duration = requestStartTime ? Date.now() - requestStartTime : null;
        
        console.log(`[${timestamp}] [TIMING] Axios Response Interceptor: Response received`, {
          requestId,
          status: response.status,
          statusText: response.statusText,
          url: response.config.url,
          method: response.config.method?.toUpperCase(),
          duration: duration ? `${duration}ms` : 'unknown',
          durationMs: duration,
          timeSinceRequestSent: duration,
          httpAgentSockets: this.httpAgent.sockets ? Object.keys(this.httpAgent.sockets).length : 0,
          httpAgentFreeSockets: this.httpAgent.freeSockets ? Object.keys(this.httpAgent.freeSockets).length : 0,
          httpAgentRequests: this.httpAgent.requests ? Object.keys(this.httpAgent.requests).length : 0,
          httpsAgentSockets: this.httpsAgent.sockets ? Object.keys(this.httpsAgent.sockets).length : 0,
          httpsAgentFreeSockets: this.httpsAgent.freeSockets ? Object.keys(this.httpsAgent.freeSockets).length : 0,
          httpsAgentRequests: this.httpsAgent.requests ? Object.keys(this.httpsAgent.requests).length : 0,
        });
        this.sharedLogger.log(`[${timestamp}] [TIMING] Axios Response Interceptor: Response received`, {
          requestId,
          status: response.status,
          duration: duration ? `${duration}ms` : 'unknown',
          durationMs: duration,
        });
        
        return response;
      },
      (error) => {
        const configAny = error.config as any;
        const requestId = configAny?.metadata?.requestId || 'unknown';
        const requestStartTime = configAny?.metadata?.requestStartTime;
        const timestamp = new Date().toISOString();
        const duration = requestStartTime ? Date.now() - requestStartTime : null;
        
        console.error(`[${timestamp}] [TIMING] Axios Response Interceptor: Error`, {
          requestId,
          error: error.message,
          errorCode: error.code,
          status: error.response?.status,
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
          duration: duration ? `${duration}ms` : 'unknown',
          durationMs: duration,
          timeSinceRequestSent: duration,
        });
        this.sharedLogger.error(`[${timestamp}] [TIMING] Axios Response Interceptor: Error`, {
          requestId,
          error: error.message,
          errorCode: error.code,
          duration: duration ? `${duration}ms` : 'unknown',
          durationMs: duration,
        });
        return Promise.reject(error);
      },
    );
    
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
   * Pre-warm connections to all backend services on startup
   * This eliminates the 24-30 second cold start delay by establishing TCP connections immediately
   */
  async onModuleInit() {
    const warmupStartTime = Date.now();
    const timestamp = new Date().toISOString();
    this.logger.log(`[${timestamp}] [WARMUP] Starting connection warmup for all backend services...`);
    this.sharedLogger.info(`[${timestamp}] [WARMUP] Starting connection warmup`, {
      services: Object.keys(this.serviceUrls),
    });

    const warmupPromises: Promise<void>[] = [];

    // Warm up connections to all configured services
    for (const [serviceName, baseUrl] of Object.entries(this.serviceUrls)) {
      // Skip auth service if it's HTTPS (external service, not in Docker network)
      if (serviceName === 'auth' && baseUrl.startsWith('https://')) {
        this.logger.log(`[${timestamp}] [WARMUP] Skipping ${serviceName} (external HTTPS service)`);
        continue;
      }

      const warmupPromise = this.warmupServiceConnection(serviceName, baseUrl)
        .catch((error) => {
          // Log but don't fail startup if warmup fails
          this.logger.warn(`[${timestamp}] [WARMUP] Failed to warmup ${serviceName}: ${error.message}`);
          this.sharedLogger.warn(`[${timestamp}] [WARMUP] Failed to warmup ${serviceName}`, {
            serviceName,
            error: error.message,
          });
        });
      
      warmupPromises.push(warmupPromise);
    }

    // Wait for all warmup requests to complete (or timeout)
    try {
      await Promise.allSettled(warmupPromises);
      const warmupDuration = Date.now() - warmupStartTime;
      this.logger.log(`[${new Date().toISOString()}] [WARMUP] Connection warmup completed (${warmupDuration}ms)`);
      this.sharedLogger.info(`[${new Date().toISOString()}] [WARMUP] Connection warmup completed`, {
        durationMs: warmupDuration,
      });
    } catch (error) {
      const warmupDuration = Date.now() - warmupStartTime;
      this.logger.error(`[${new Date().toISOString()}] [WARMUP] Connection warmup completed with errors (${warmupDuration}ms)`, error);
      this.sharedLogger.error(`[${new Date().toISOString()}] [WARMUP] Connection warmup completed with errors`, {
        durationMs: warmupDuration,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Warm up a single service connection by making a health check request
   * If baseUrl is gateway-proxy, use the correct Nginx route path
   */
  private async warmupServiceConnection(serviceName: string, baseUrl: string): Promise<void> {
    const warmupStartTime = Date.now();
    const timestamp = new Date().toISOString();
    
    // If using Nginx proxy (gateway-proxy), construct the correct path
    // Otherwise use direct service health endpoint
    let healthUrl: string;
    if (baseUrl.includes('gateway-proxy')) {
      // Nginx routes: /allegro/*, /settings, /import/*
      if (serviceName === 'allegro') {
        healthUrl = `${baseUrl}/allegro/health`;
      } else if (serviceName === 'settings') {
        healthUrl = `${baseUrl}/settings/health`;
      } else if (serviceName === 'import') {
        healthUrl = `${baseUrl}/import/health`;
      } else {
        healthUrl = `${baseUrl}/health`;
      }
    } else {
      // Direct service connection
      healthUrl = `${baseUrl}/health`;
    }
    
    this.logger.log(`[${timestamp}] [WARMUP] Warming up connection to ${serviceName} at ${healthUrl}`);
    
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout for warmup (faster than normal requests)
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 500, // Accept any response
        // Use keep-alive agents to establish and reuse connections
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
      };

      const response = await firstValueFrom(this.httpService.get(healthUrl, config));
      const warmupDuration = Date.now() - warmupStartTime;
      
      this.logger.log(`[${new Date().toISOString()}] [WARMUP] ${serviceName} connection warmed up (${warmupDuration}ms) - Status: ${response.status}`);
      this.sharedLogger.info(`[${new Date().toISOString()}] [WARMUP] ${serviceName} connection warmed up`, {
        serviceName,
        healthUrl,
        status: response.status,
        durationMs: warmupDuration,
      });
    } catch (error: any) {
      const warmupDuration = Date.now() - warmupStartTime;
      // Don't throw - warmup failures shouldn't prevent startup
      // The connection might still be established even if the health check fails
      this.logger.warn(`[${new Date().toISOString()}] [WARMUP] ${serviceName} warmup request failed (${warmupDuration}ms): ${error.message}`);
      this.sharedLogger.warn(`[${new Date().toISOString()}] [WARMUP] ${serviceName} warmup request failed`, {
        serviceName,
        healthUrl,
        durationMs: warmupDuration,
        error: error.message,
        errorCode: error.code,
      });
      
      // Even if the request fails, the TCP connection might have been established
      // This is still valuable for eliminating the cold start delay
    }
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
    // Validation operations that call external APIs need longer timeouts
    const isValidationOperation = path.includes('/validate/allegro') || path.includes('/validate/');
    const defaultTimeout = (() => {
      const gatewayTimeout = this.configService.get<string>('GATEWAY_TIMEOUT');
      const httpTimeout = this.configService.get<string>('HTTP_TIMEOUT');
      const timeout = gatewayTimeout || httpTimeout;
      if (!timeout) {
        throw new Error('GATEWAY_TIMEOUT or HTTP_TIMEOUT must be configured in .env file');
      }
      return parseInt(timeout);
    })();
    
    // Use longer timeout for bulk operations and validation operations
    // publish-all can take 5+ minutes for many offers (30 seconds per offer * 29 offers = ~14 minutes worst case)
    // Set to 10 minutes (600000ms) to be safe
    // Validation operations call external APIs (Allegro) which can take 30-60 seconds
    // Set to 90 seconds (90000ms) to be safe for validation
    // Regular operations (like account activation, settings updates) should be fast - use default timeout (typically 30s)
    // Only increase timeout for operations that are known to be slow
    const timeout = isPublishAll ? 600000 : (isBulkOperation ? 120000 : (isValidationOperation ? 90000 : defaultTimeout));
    
    // Determine if URL is HTTPS or HTTP to use correct agent
    const isHttps = url.startsWith('https://');
    
    // Generate request ID for tracking (must be before config to use in metadata)
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
    // Use shared fresh agents without keep-alive for ALL requests
    // This prevents stale connection reuse while avoiding overhead of creating new agents per request
    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'close', // Always close connections to prevent reuse issues
        ...headers,
      },
      timeout,
      maxRedirects: followRedirects ? 5 : 0,
      validateStatus: (status) => status >= 200 && status < 600, // Accept all HTTP status codes (including errors)
      // Use shared fresh agents without keep-alive for all requests
      httpAgent: isHttps ? undefined : this.freshHttpAgent,
      httpsAgent: isHttps ? this.freshHttpsAgent : undefined,
        // Pass metadata to interceptors
        metadata: {
          requestId,
          serviceName,
          method,
          url,
          path,
        },
      } as any; // TypeScript doesn't know about metadata, but it works at runtime
    
    // Log agent usage and connection details for debugging
    const agentCheckTime = Date.now();
    // Count sockets/requests instead of serializing them (they contain circular references)
    const httpSocketsCount = Object.keys(this.httpAgent.sockets || {}).length;
    const httpFreeSocketsCount = Object.keys(this.httpAgent.freeSockets || {}).length;
    const httpRequestsCount = Object.keys(this.httpAgent.requests || {}).length;
    const httpsSocketsCount = Object.keys(this.httpsAgent.sockets || {}).length;
    const httpsFreeSocketsCount = Object.keys(this.httpsAgent.freeSockets || {}).length;
    const httpsRequestsCount = Object.keys(this.httpsAgent.requests || {}).length;
    
    const agentInfo = {
      hasHttpAgent: !!config.httpAgent,
      hasHttpsAgent: !!config.httpsAgent,
      isHttps,
      httpAgentSockets: httpSocketsCount,
      httpAgentFreeSockets: httpFreeSocketsCount,
      httpAgentRequests: httpRequestsCount,
      httpsAgentSockets: httpsSocketsCount,
      httpsAgentFreeSockets: httpsFreeSocketsCount,
      httpsAgentRequests: httpsRequestsCount,
      axiosDefaultsHttpAgent: !!this.httpService.axiosRef.defaults.httpAgent,
      axiosDefaultsHttpsAgent: !!this.httpService.axiosRef.defaults.httpsAgent,
    };
    console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: Agent check (${Date.now() - agentCheckTime}ms) for ${url}`, agentInfo);
    // Log agent type - always using fresh agents now
    const agentType = 'fresh agent (no keep-alive)';
    this.logger.debug(`[${requestId}] Using ${agentType} for ${method} ${url}`, agentInfo);
    
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
      
      // Extract hostname for DNS timing
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const port = urlObj.port || (url.startsWith('https') ? '443' : '80');
      
      console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: About to call Axios ${method} ${url}`, {
        requestId,
        timeSinceRequestStart: axiosMethodStartTime - startTime,
        hostname,
        port,
      });
      
      console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: About to create Axios promise ${method} ${url}`, {
        requestId,
        timeSinceRequestStart: axiosMethodStartTime - startTime,
        hostname,
        port,
        hasHttpAgent: !!config.httpAgent,
        hasHttpsAgent: !!config.httpsAgent,
        agentMaxSockets: config.httpAgent ? (config.httpAgent as any).maxSockets : (config.httpsAgent ? (config.httpsAgent as any).maxSockets : 'N/A'),
      });
      
      // Create the promise and immediately log
      const promiseCreationTime = Date.now();
      let axiosPromise;
      
      // Log body details before making request
      const bodyStr = body ? (typeof body === 'object' ? JSON.stringify(body) : String(body)) : 'undefined';
      console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: About to make ${method} request`, {
        requestId,
        url,
        hasBody: !!body,
        bodyType: typeof body,
        bodyLength: bodyStr.length,
        bodyPreview: bodyStr.substring(0, 200),
      });

      switch (method.toUpperCase()) {
        case 'GET':
          axiosPromise = firstValueFrom(this.httpService.get(url, config));
          break;
        case 'POST':
          // For POST requests, always send body (even if undefined/empty) to ensure proper Content-Length header
          axiosPromise = firstValueFrom(this.httpService.post(url, body || {}, config));
          break;
        case 'PUT':
          axiosPromise = firstValueFrom(this.httpService.put(url, body || {}, config));
          break;
        case 'DELETE':
          axiosPromise = firstValueFrom(this.httpService.delete(url, config));
          break;
        case 'PATCH':
          axiosPromise = firstValueFrom(this.httpService.patch(url, body || {}, config));
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
      
      const promiseCreatedTime = Date.now();
      const promiseCreationDuration = promiseCreatedTime - promiseCreationTime;
      console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: Axios promise created (${promiseCreationDuration}ms)`, {
        requestId,
        hostname,
        timeSinceRequestStart: promiseCreatedTime - startTime,
      });
      
      // Log when we start awaiting the promise (this is when actual network I/O begins)
      const awaitStartTime = Date.now();
      const prepDuration = awaitStartTime - axiosMethodStartTime;
      console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: Starting to await Axios promise (prep: ${prepDuration}ms)`, {
        requestId,
        hostname,
        port,
        timeSinceRequestStart: awaitStartTime - startTime,
        httpAgentSockets: this.httpAgent.sockets ? Object.keys(this.httpAgent.sockets).length : 0,
        httpAgentFreeSockets: this.httpAgent.freeSockets ? Object.keys(this.httpAgent.freeSockets).length : 0,
        httpAgentRequests: this.httpAgent.requests ? Object.keys(this.httpAgent.requests).length : 0,
        httpsAgentSockets: this.httpsAgent.sockets ? Object.keys(this.httpsAgent.sockets).length : 0,
        httpsAgentFreeSockets: this.httpsAgent.freeSockets ? Object.keys(this.httpsAgent.freeSockets).length : 0,
        httpsAgentRequests: this.httpsAgent.requests ? Object.keys(this.httpsAgent.requests).length : 0,
      });
      this.sharedLogger.log(`[${new Date().toISOString()}] [TIMING] GatewayService: Starting to await Axios promise`, {
        requestId,
        hostname,
        port,
        timeSinceRequestStart: awaitStartTime - startTime,
        prepDuration,
      });
      
      // Await the response - this is where the actual network delay happens
      response = await axiosPromise;
      
      const awaitCompleteTime = Date.now();
      const awaitDuration = awaitCompleteTime - awaitStartTime;
      console.log(`[${new Date().toISOString()}] [TIMING] GatewayService: Axios promise resolved (await: ${awaitDuration}ms)`, {
        requestId,
        hostname,
        port,
        totalTimeSinceStart: awaitCompleteTime - startTime,
        httpAgentSockets: this.httpAgent.sockets ? Object.keys(this.httpAgent.sockets).length : 0,
        httpAgentFreeSockets: this.httpAgent.freeSockets ? Object.keys(this.httpAgent.freeSockets).length : 0,
        httpAgentRequests: this.httpAgent.requests ? Object.keys(this.httpAgent.requests).length : 0,
        httpsAgentSockets: this.httpsAgent.sockets ? Object.keys(this.httpsAgent.sockets).length : 0,
        httpsAgentFreeSockets: this.httpsAgent.freeSockets ? Object.keys(this.httpsAgent.freeSockets).length : 0,
        httpsAgentRequests: this.httpsAgent.requests ? Object.keys(this.httpsAgent.requests).length : 0,
      });
      this.sharedLogger.log(`[${new Date().toISOString()}] [TIMING] GatewayService: Axios promise resolved`, {
        requestId,
        hostname,
        port,
        awaitDuration,
        totalTimeSinceStart: awaitCompleteTime - startTime,
      });

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

