/**
 * Allegro API Service
 * Handles communication with Allegro REST API
 */

import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '@allegro/shared';
import { AllegroAuthService } from './allegro-auth.service';

@Injectable()
export class AllegroApiService {
  private readonly apiUrl: string;
  private readonly useSandbox: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly authService: AllegroAuthService,
  ) {
    this.useSandbox = this.configService.get('ALLEGRO_USE_SANDBOX') === 'true';
    this.apiUrl = this.useSandbox
      ? this.configService.get('ALLEGRO_API_SANDBOX_URL') || this.throwConfigError('ALLEGRO_API_SANDBOX_URL')
      : this.configService.get('ALLEGRO_API_URL') || this.throwConfigError('ALLEGRO_API_URL');
  }

  /**
   * Get access token
   */
  private async getAccessToken(): Promise<string> {
    return await this.authService.getAccessToken();
  }

  /**
   * Make authenticated request to Allegro API
   */
  private async request(method: string, endpoint: string, data?: any): Promise<any> {
    console.log('[AllegroApiService.request] ========== METHOD CALLED ==========', { method, endpoint });
    const tokenStartTime = Date.now();
    console.log('[AllegroApiService.request] About to get access token');
    const token = await this.getAccessToken();
    const tokenDuration = Date.now() - tokenStartTime;
    console.log('[AllegroApiService.request] Access token obtained', { tokenDuration: `${tokenDuration}ms` });
    
    const url = `${this.apiUrl}${endpoint}`;
    console.log('[AllegroApiService.request] URL prepared', { url, method });

    try {
      // Allegro API requires application/vnd.allegro.public.v1+json for PUT/POST/PATCH requests
      const contentType = (method.toUpperCase() === 'PUT' || method.toUpperCase() === 'POST' || method.toUpperCase() === 'PATCH')
        ? 'application/vnd.allegro.public.v1+json'
        : 'application/json';

      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': contentType,
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
        timeout: 120000, // 120 seconds for Allegro API requests (large payloads can be slow)
      };

      console.log('[AllegroApiService.request] About to send HTTP request', { method, endpoint, timeout: config.timeout });
      const httpStartTime = Date.now();
      let response;
      switch (method.toUpperCase()) {
        case 'GET':
          response = await firstValueFrom(this.httpService.get(url, config));
          break;
        case 'POST':
          response = await firstValueFrom(this.httpService.post(url, data, config));
          break;
        case 'PUT':
          response = await firstValueFrom(this.httpService.put(url, data, config));
          break;
        case 'PATCH':
          response = await firstValueFrom(this.httpService.patch(url, data, config));
          break;
        case 'DELETE':
          response = await firstValueFrom(this.httpService.delete(url, config));
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
      const httpDuration = Date.now() - httpStartTime;
      console.log('[AllegroApiService.request] HTTP request completed', { 
        method, 
        endpoint, 
        httpDuration: `${httpDuration}ms`,
        status: response?.status,
      });

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      console.log('[AllegroApiService.request] HTTP request failed', {
        method,
        endpoint,
        error: error.message,
        errorCode: error.code,
        isTimeout,
        status: error.response?.status,
      });
      // Extract error details for better logging
      const errorDetails = errorData.errors ? JSON.stringify(errorData.errors, null, 2) : JSON.stringify(errorData, null, 2);
      this.logger.error('Allegro API request failed', {
        method,
        endpoint,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData: errorData,
        errorDetails: errorDetails,
        responseHeaders: error.response?.headers,
      });
      throw error;
    }
  }

  /**
   * Get offers
   */
  async getOffers(params?: any) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/sale/offers${queryString ? `?${queryString}` : ''}`;
    return this.request('GET', endpoint);
  }

  /**
   * Get offers with OAuth token (for user-specific resources)
   */
  async getOffersWithOAuthToken(accessToken: string, params?: any) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/sale/offers${queryString ? `?${queryString}` : ''}`;
    const url = `${this.apiUrl}${endpoint}`;

    try {
      const config = {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
      };

      const response = await firstValueFrom(this.httpService.get(url, config));
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      this.logger.error('Allegro API request failed with OAuth token', {
        endpoint,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData: errorData,
        responseHeaders: error.response?.headers,
      });
      throw error;
    }
  }

  /**
   * Get offers with custom credentials (for user-specific API keys)
   */
  async getOffersWithCredentials(clientId: string, clientSecret: string, params?: any) {
    const token = await this.authService.getAccessTokenWithCredentials(clientId, clientSecret);
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/sale/offers${queryString ? `?${queryString}` : ''}`;
    const url = `${this.apiUrl}${endpoint}`;

    try {
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
      };

      const response = await firstValueFrom(this.httpService.get(url, config));
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      this.logger.error('Allegro API request failed with custom credentials', {
        endpoint,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData: errorData,
        responseHeaders: error.response?.headers,
      });
      throw error;
    }
  }

  /**
   * Get offer by ID
   */
  async getOffer(offerId: string) {
    return this.request('GET', `/sale/offers/${offerId}`);
  }

  /**
   * Get offer by ID with OAuth token (for user-specific resources)
   */
  async getOfferWithOAuthToken(accessToken: string, offerId: string) {
    const endpoint = `/sale/product-offers/${offerId}`;
    const url = `${this.apiUrl}${endpoint}`;

    try {
      this.logger.log('[getOfferWithOAuthToken] Fetching offer', {
        endpoint,
        offerId,
        timeoutMs: 10000,
      });

      const config = {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
        timeout: 10000, // 10 seconds timeout for fetching current offer
      };

      const response = await firstValueFrom(this.httpService.get(url, config));
      this.logger.log('[getOfferWithOAuthToken] Response received', {
        endpoint,
        offerId,
        status: response.status,
        contentLength: response.headers?.['content-length'],
      });
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      this.logger.error('Allegro API request failed with OAuth token', {
        endpoint,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData: errorData,
        responseHeaders: error.response?.headers,
        isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
        requestConfig: {
          timeout: error.config?.timeout,
          url: error.config?.url,
          method: error.config?.method,
        },
      });
      throw error;
    }
  }

  /**
   * Get product details by productId with OAuth token
   */
  async getProductWithOAuthToken(accessToken: string, productId: string) {
    const endpoint = `/sale/products/${productId}`;
    const url = `${this.apiUrl}${endpoint}`;

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.allegro.public.v1+json',
        },
        timeout: 10000,
      };
      const response = await firstValueFrom(this.httpService.get(url, config));
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      this.logger.error('Allegro API request failed when fetching product with OAuth token', {
        endpoint,
        productId,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData,
        responseHeaders: error.response?.headers,
        isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
      });
      throw error;
    }
  }

  /**
   * Search products in Allegro catalog with OAuth token
   * Searches by EAN, manufacturer code, or product name
   */
  async searchProductsWithOAuthToken(
    accessToken: string,
    query: { ean?: string; manufacturerCode?: string; name?: string },
  ) {
    const params: any = {};
    if (query.ean) {
      params.ean = query.ean;
    }
    if (query.manufacturerCode) {
      params['manufacturerCode'] = query.manufacturerCode;
    }
    if (query.name) {
      params.name = query.name;
    }

    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/sale/products${queryString ? `?${queryString}` : ''}`;
    const url = `${this.apiUrl}${endpoint}`;

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.allegro.public.v1+json',
        },
        timeout: 10000,
      };

      const response = await firstValueFrom(this.httpService.get(url, config));
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      this.logger.error('Allegro API request failed when searching products with OAuth token', {
        endpoint,
        query,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData,
        responseHeaders: error.response?.headers,
        isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
      });
      throw error;
    }
  }

  /**
   * Create product in Allegro catalog with OAuth token
   * Requires mandatory fields: brand, model, manufacturer code, category, parameters
   */
  async createProductWithOAuthToken(accessToken: string, productData: any) {
    const endpoint = `/sale/products`;
    const url = `${this.apiUrl}${endpoint}`;

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/vnd.allegro.public.v1+json',
          Accept: 'application/vnd.allegro.public.v1+json',
        },
        timeout: 30000, // 30 seconds timeout for product creation
      };

      const response = await firstValueFrom(this.httpService.post(url, productData, config));
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      this.logger.error('Allegro API request failed when creating product with OAuth token', {
        endpoint,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData,
        errorDetails: JSON.stringify(errorData, null, 2),
        requestPayload: JSON.stringify(productData, null, 2).substring(0, 1000),
        responseHeaders: error.response?.headers,
        isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
      });
      throw error;
    }
  }

  /**
   * Create offer
   * @deprecated Use createOfferWithOAuthToken instead. This endpoint uses deprecated /sale/offers
   */
  async createOffer(data: any) {
    return this.request('POST', '/sale/offers', data);
  }

  /**
   * Create offer with OAuth token (for user-specific resources)
   * Uses the new /sale/product-offers endpoint (replaces deprecated /sale/offers)
   */
  async createOfferWithOAuthToken(accessToken: string, data: any) {
    const endpoint = `/sale/product-offers`;
    const url = `${this.apiUrl}${endpoint}`;
    const requestId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestStartTime = Date.now();

    try {
      const payloadSize = JSON.stringify(data).length;
      this.logger.log(`[${requestId}] [createOfferWithOAuthToken] ========== ALLEGRO API REQUEST ==========`, {
        endpoint,
        method: 'POST',
        url,
        payloadSize: `${payloadSize} bytes`,
        payloadKeys: Object.keys(data),
        hasName: !!data.name,
        hasCategory: !!data.category,
        categoryId: data.category?.id,
        hasSellingMode: !!data.sellingMode,
        price: data.sellingMode?.price?.amount,
        currency: data.sellingMode?.price?.currency,
        hasStock: !!data.stock,
        stockAvailable: data.stock?.available,
        hasImages: !!data.images,
        imagesCount: data.images?.length || 0,
        hasProductSet: !!data.productSet,
        productId: data.productSet?.[0]?.product?.id,
        hasParameters: !!data.parameters,
        parametersCount: data.parameters?.length || 0,
        hasDescription: !!data.description,
        descriptionLength: data.description?.length || 0,
        tokenLength: accessToken?.length || 0,
        tokenPreview: accessToken ? `${accessToken.substring(0, 20)}...${accessToken.substring(accessToken.length - 10)}` : 'null',
        payloadPreview: JSON.stringify(data, null, 2).substring(0, 2000),
        timestamp: new Date().toISOString(),
      });

      const config = {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/vnd.allegro.public.v1+json',
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
        timeout: 120000, // 120 seconds timeout for create offer (large payloads can be slow)
      };

      this.logger.log(`[${requestId}] [createOfferWithOAuthToken] Sending HTTP POST request`, {
        url,
        headers: Object.keys(config.headers),
        timeout: config.timeout,
        payloadSize: `${JSON.stringify(data).length} bytes`,
        timestamp: new Date().toISOString(),
      });

      const httpRequestStartTime = Date.now();
      this.logger.log(`[${requestId}] [createOfferWithOAuthToken] About to call firstValueFrom (HTTP request starting)`, {
        url,
        timestamp: new Date().toISOString(),
      });

      const response = await firstValueFrom(this.httpService.post(url, data, config));
      const httpRequestDuration = Date.now() - httpRequestStartTime;
      
      this.logger.log(`[${requestId}] [createOfferWithOAuthToken] HTTP request completed`, {
        httpRequestDuration: `${httpRequestDuration}ms`,
        status: response.status,
        timestamp: new Date().toISOString(),
      });
      const requestDuration = Date.now() - requestStartTime;
      
      this.logger.log(`[${requestId}] [createOfferWithOAuthToken] ========== ALLEGRO API RESPONSE SUCCESS ==========`, {
        endpoint,
        method: 'POST',
        status: response.status,
        statusText: response.statusText,
        requestDuration: `${requestDuration}ms`,
        responseKeys: response.data ? Object.keys(response.data) : [],
        responseId: response.data?.id,
        responseSize: JSON.stringify(response.data).length,
        responsePreview: JSON.stringify(response.data, null, 2).substring(0, 2000),
        timestamp: new Date().toISOString(),
      });
      
      return response.data;
    } catch (error: any) {
      const requestDuration = Date.now() - requestStartTime;
      const errorData = error.response?.data || {};
      const errorDetails = JSON.stringify(errorData, null, 2);
      
      this.logger.error(`[${requestId}] [createOfferWithOAuthToken] ========== ALLEGRO API RESPONSE ERROR ==========`, {
        endpoint,
        method: 'POST',
        url,
        error: error.message,
        errorCode: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        requestDuration: `${requestDuration}ms`,
        isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
        errorData: errorData,
        errorDetails: errorDetails,
        errorResponseKeys: errorData ? Object.keys(errorData) : [],
        hasErrorsArray: !!(errorData.errors && Array.isArray(errorData.errors)),
        errorsCount: errorData.errors?.length || 0,
        firstError: errorData.errors?.[0] ? JSON.stringify(errorData.errors[0], null, 2) : undefined,
        userMessage: errorData.userMessage,
        message: errorData.message,
        code: errorData.code,
        path: errorData.path,
        errorDescription: errorData.error_description,
        responseHeaders: error.response?.headers ? JSON.stringify(error.response.headers) : undefined,
        requestPayload: JSON.stringify(data, null, 2).substring(0, 2000),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Update offer
   */
  async updateOffer(offerId: string, data: any) {
    return this.request('PUT', `/sale/offers/${offerId}`, data);
  }

  /**
   * Update offer with OAuth token (for user-specific resources)
   * Uses the new /sale/product-offers endpoint (replaces deprecated /sale/offers)
   */
  async updateOfferWithOAuthToken(accessToken: string, offerId: string, data: any) {
    // Use new product-offers endpoint (replaces deprecated /sale/offers)
    const endpoint = `/sale/product-offers/${offerId}`;
    const url = `${this.apiUrl}${endpoint}`;
    const requestId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestStartTime = Date.now();

    try {
      const payloadSize = JSON.stringify(data).length;
      this.logger.log(`[${requestId}] [updateOfferWithOAuthToken] ========== ALLEGRO API REQUEST ==========`, {
        endpoint,
        method: 'PATCH',
        url,
        offerId,
        payloadSize: `${payloadSize} bytes`,
        payloadKeys: Object.keys(data),
        hasName: !!data.name,
        hasCategory: !!data.category,
        categoryId: data.category?.id,
        hasSellingMode: !!data.sellingMode,
        price: data.sellingMode?.price?.amount,
        currency: data.sellingMode?.price?.currency,
        hasStock: !!data.stock,
        stockAvailable: data.stock?.available,
        hasImages: !!data.images,
        imagesCount: data.images?.length || 0,
        hasParameters: !!data.parameters,
        parametersCount: data.parameters?.length || 0,
        tokenLength: accessToken?.length || 0,
        tokenPreview: accessToken ? `${accessToken.substring(0, 20)}...${accessToken.substring(accessToken.length - 10)}` : 'null',
        payloadPreview: JSON.stringify(data, null, 2).substring(0, 2000),
        timestamp: new Date().toISOString(),
      });

      const config = {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/vnd.allegro.public.v1+json',
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
        timeout: 120000, // 120 seconds timeout - Allegro API can be slow for large payloads
      };

      this.logger.log(`[${requestId}] [updateOfferWithOAuthToken] Sending HTTP PATCH request`, {
        url,
        headers: Object.keys(config.headers),
        timeout: config.timeout,
        payloadSize: `${JSON.stringify(data).length} bytes`,
        timestamp: new Date().toISOString(),
      });

      const httpRequestStartTime = Date.now();
      this.logger.log(`[${requestId}] [updateOfferWithOAuthToken] About to call firstValueFrom (HTTP request starting)`, {
        url,
        timestamp: new Date().toISOString(),
      });

      // Use PATCH for updates - Allegro API /sale/product-offers/{id} endpoint requires PATCH method
      // PUT returns 405 Method Not Allowed
      const response = await firstValueFrom(this.httpService.patch(url, data, config));
      const httpRequestDuration = Date.now() - httpRequestStartTime;
      
      this.logger.log(`[${requestId}] [updateOfferWithOAuthToken] HTTP request completed`, {
        httpRequestDuration: `${httpRequestDuration}ms`,
        status: response.status,
        timestamp: new Date().toISOString(),
      });
      const requestDuration = Date.now() - requestStartTime;
      
      this.logger.log(`[${requestId}] [updateOfferWithOAuthToken] ========== ALLEGRO API RESPONSE SUCCESS ==========`, {
        endpoint,
        method: 'PATCH',
        offerId,
        status: response.status,
        statusText: response.statusText,
        requestDuration: `${requestDuration}ms`,
        responseKeys: response.data ? Object.keys(response.data) : [],
        responseId: response.data?.id,
        responseSize: JSON.stringify(response.data).length,
        responsePreview: JSON.stringify(response.data, null, 2).substring(0, 2000),
        timestamp: new Date().toISOString(),
      });
      
      return response.data;
    } catch (error: any) {
      const requestDuration = Date.now() - requestStartTime;
      const errorData = error.response?.data || {};
      const errorDetails = JSON.stringify(errorData, null, 2);
      
      this.logger.error(`[${requestId}] [updateOfferWithOAuthToken] ========== ALLEGRO API RESPONSE ERROR ==========`, {
        endpoint,
        method: 'PATCH',
        url,
        offerId,
        error: error.message,
        errorCode: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        requestDuration: `${requestDuration}ms`,
        isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
        errorData: errorData,
        errorDetails: errorDetails,
        errorResponseKeys: errorData ? Object.keys(errorData) : [],
        hasErrorsArray: !!(errorData.errors && Array.isArray(errorData.errors)),
        errorsCount: errorData.errors?.length || 0,
        firstError: errorData.errors?.[0] ? JSON.stringify(errorData.errors[0], null, 2) : undefined,
        userMessage: errorData.userMessage,
        message: errorData.message,
        code: errorData.code,
        path: errorData.path,
        errorDescription: errorData.error_description,
        responseHeaders: error.response?.headers ? JSON.stringify(error.response.headers) : undefined,
        requestPayload: JSON.stringify(data, null, 2).substring(0, 2000),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Publish / unpublish offers using Allegro command pattern
   * Wrapper for:
   * PUT /sale/offer-publication-commands/{commandId}
   *
   * @param accessToken OAuth access token
   * @param offerIds Allegro offer IDs to publish/unpublish
   * @param action "ACTIVATE" to publish, "END" to end offers
   */
  async publishOffersWithOAuthToken(
    accessToken: string,
    offerIds: string[],
    action: 'ACTIVATE' | 'END' = 'ACTIVATE',
  ): Promise<{ commandId: string; response: any }> {
    const commandId = `publish-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const endpoint = `/sale/offer-publication-commands/${commandId}`;
    const url = `${this.apiUrl}${endpoint}`;
    const requestId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestStartTime = Date.now();

    const body = {
      publication: { action },
      offerCriteria: [
        {
          type: 'CONTAINS_OFFERS',
          offers: offerIds.map((id) => ({ id })),
        },
      ],
    };

    try {
      const payloadSize = JSON.stringify(body).length;
      this.logger.log(`[${requestId}] [publishOffersWithOAuthToken] ========== ALLEGRO API REQUEST ==========` as string, {
        endpoint,
        method: 'PUT',
        url,
        commandId,
        action,
        offerIdsCount: offerIds.length,
        firstOfferIds: offerIds.slice(0, 10),
        payloadSize: `${payloadSize} bytes`,
        payloadKeys: Object.keys(body),
        tokenLength: accessToken?.length || 0,
        tokenPreview: accessToken ? `${accessToken.substring(0, 20)}...${accessToken.substring(accessToken.length - 10)}` : 'null',
        payloadPreview: JSON.stringify(body, null, 2).substring(0, 2000),
        timestamp: new Date().toISOString(),
      });

      const config = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/vnd.allegro.public.v1+json',
          Accept: 'application/vnd.allegro.public.v1+json',
        },
        timeout: 15000,
      };

      this.logger.log(`[${requestId}] [publishOffersWithOAuthToken] Sending HTTP PUT request` as string, {
        url,
        headers: Object.keys(config.headers),
        timeout: config.timeout,
        payloadSize: `${payloadSize} bytes`,
        timestamp: new Date().toISOString(),
      });

      const httpRequestStartTime = Date.now();
      const response = await firstValueFrom(this.httpService.put(url, body, config));
      const httpRequestDuration = Date.now() - httpRequestStartTime;

      this.logger.log(`[${requestId}] [publishOffersWithOAuthToken] HTTP request completed` as string, {
        httpRequestDuration: `${httpRequestDuration}ms`,
        status: response.status,
        timestamp: new Date().toISOString(),
      });

      const requestDuration = Date.now() - requestStartTime;
      this.logger.log(
        `[${requestId}] [publishOffersWithOAuthToken] ========== ALLEGRO API RESPONSE SUCCESS ==========` as string,
        {
          endpoint,
          method: 'PUT',
          commandId,
          action,
          status: response.status,
          statusText: response.statusText,
          requestDuration: `${requestDuration}ms`,
          responseKeys: response.data ? Object.keys(response.data) : [],
          responseSize: JSON.stringify(response.data).length,
          responsePreview: JSON.stringify(response.data, null, 2).substring(0, 2000),
          timestamp: new Date().toISOString(),
        },
      );

      return { commandId, response: response.data };
    } catch (error: any) {
      const requestDuration = Date.now() - requestStartTime;
      const errorData = error.response?.data || {};
      const errorDetails = JSON.stringify(errorData, null, 2);

      this.logger.error(
        `[${requestId}] [publishOffersWithOAuthToken] ========== ALLEGRO API RESPONSE ERROR ==========` as string,
        {
          endpoint,
          method: 'PUT',
          url,
          commandId,
          action,
          error: error.message,
          errorCode: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          requestDuration: `${requestDuration}ms`,
          isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
          errorData,
          errorDetails,
          errorResponseKeys: errorData ? Object.keys(errorData) : [],
          hasErrorsArray: !!(errorData.errors && Array.isArray(errorData.errors)),
          errorsCount: errorData.errors?.length || 0,
          firstError: errorData.errors?.[0] ? JSON.stringify(errorData.errors[0], null, 2) : undefined,
          userMessage: errorData.userMessage,
          message: errorData.message,
          code: errorData.code,
          path: errorData.path,
          errorDescription: errorData.error_description,
          responseHeaders: error.response?.headers ? JSON.stringify(error.response.headers) : undefined,
          requestPayload: JSON.stringify(body, null, 2).substring(0, 2000),
          timestamp: new Date().toISOString(),
        },
      );
      throw error;
    }
  }

  /**
   * Get publish command summary
   * GET /sale/offer-publication-commands/{commandId}
   */
  async getOfferPublicationCommandStatusWithOAuthToken(
    accessToken: string,
    commandId: string,
  ): Promise<any> {
    const endpoint = `/sale/offer-publication-commands/${commandId}`;
    const url = `${this.apiUrl}${endpoint}`;
    const requestId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestStartTime = Date.now();

    try {
      this.logger.log(
        `[${requestId}] [getOfferPublicationCommandStatusWithOAuthToken] Fetching publish command status` as string,
        {
          endpoint,
          commandId,
          url,
          timestamp: new Date().toISOString(),
        },
      );

      const config = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.allegro.public.v1+json',
        },
        timeout: 10000,
      };

      const httpRequestStartTime = Date.now();
      const response = await firstValueFrom(this.httpService.get(url, config));
      const httpRequestDuration = Date.now() - httpRequestStartTime;

      this.logger.log(
        `[${requestId}] [getOfferPublicationCommandStatusWithOAuthToken] HTTP request completed` as string,
        {
          httpRequestDuration: `${httpRequestDuration}ms`,
          status: response.status,
          timestamp: new Date().toISOString(),
        },
      );

      const requestDuration = Date.now() - requestStartTime;
      this.logger.log(
        `[${requestId}] [getOfferPublicationCommandStatusWithOAuthToken] Command status received` as string,
        {
          endpoint,
          commandId,
          status: response.status,
          statusText: response.statusText,
          requestDuration: `${requestDuration}ms`,
          responseKeys: response.data ? Object.keys(response.data) : [],
          responseSize: JSON.stringify(response.data).length,
          responsePreview: JSON.stringify(response.data, null, 2).substring(0, 2000),
          timestamp: new Date().toISOString(),
        },
      );

      return response.data;
    } catch (error: any) {
      const requestDuration = Date.now() - requestStartTime;
      const errorData = error.response?.data || {};
      const errorDetails = JSON.stringify(errorData, null, 2);

      this.logger.error(
        `[${requestId}] [getOfferPublicationCommandStatusWithOAuthToken] Failed to fetch publish command status` as string,
        {
          endpoint,
          commandId,
          url,
          error: error.message,
          errorCode: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          requestDuration: `${requestDuration}ms`,
          isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
          errorData,
          errorDetails,
          errorResponseKeys: errorData ? Object.keys(errorData) : [],
          hasErrorsArray: !!(errorData.errors && Array.isArray(errorData.errors)),
          errorsCount: errorData.errors?.length || 0,
          firstError: errorData.errors?.[0] ? JSON.stringify(errorData.errors[0], null, 2) : undefined,
          userMessage: errorData.userMessage,
          message: errorData.message,
          code: errorData.code,
          path: errorData.path,
          errorDescription: errorData.error_description,
          responseHeaders: error.response?.headers ? JSON.stringify(error.response.headers) : undefined,
          timestamp: new Date().toISOString(),
        },
      );
      throw error;
    }
  }

  /**
   * Get publish command detailed tasks (per-offer results)
   * GET /sale/offer-publication-commands/{commandId}/tasks
   */
  async getOfferPublicationCommandTasksWithOAuthToken(
    accessToken: string,
    commandId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<any> {
    const queryParams: any = {};
    if (params?.limit !== undefined) queryParams.limit = params.limit;
    if (params?.offset !== undefined) queryParams.offset = params.offset;
    const queryString = Object.keys(queryParams).length
      ? `?${new URLSearchParams(queryParams as any).toString()}`
      : '';

    const endpoint = `/sale/offer-publication-commands/${commandId}/tasks${queryString}`;
    const url = `${this.apiUrl}${endpoint}`;
    const requestId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestStartTime = Date.now();

    try {
      this.logger.log(
        `[${requestId}] [getOfferPublicationCommandTasksWithOAuthToken] Fetching publish command tasks` as string,
        {
          endpoint,
          commandId,
          url,
          params: queryParams,
          timestamp: new Date().toISOString(),
        },
      );

      const config = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.allegro.public.v1+json',
        },
        timeout: 10000,
      };

      const httpRequestStartTime = Date.now();
      const response = await firstValueFrom(this.httpService.get(url, config));
      const httpRequestDuration = Date.now() - httpRequestStartTime;

      this.logger.log(
        `[${requestId}] [getOfferPublicationCommandTasksWithOAuthToken] HTTP request completed` as string,
        {
          httpRequestDuration: `${httpRequestDuration}ms`,
          status: response.status,
          timestamp: new Date().toISOString(),
        },
      );

      const requestDuration = Date.now() - requestStartTime;
      this.logger.log(
        `[${requestId}] [getOfferPublicationCommandTasksWithOAuthToken] Tasks received` as string,
        {
          endpoint,
          commandId,
          status: response.status,
          statusText: response.statusText,
          requestDuration: `${requestDuration}ms`,
          responseKeys: response.data ? Object.keys(response.data) : [],
          responseSize: JSON.stringify(response.data).length,
          responsePreview: JSON.stringify(response.data, null, 2).substring(0, 2000),
          timestamp: new Date().toISOString(),
        },
      );

      return response.data;
    } catch (error: any) {
      const requestDuration = Date.now() - requestStartTime;
      const errorData = error.response?.data || {};
      const errorDetails = JSON.stringify(errorData, null, 2);

      this.logger.error(
        `[${requestId}] [getOfferPublicationCommandTasksWithOAuthToken] Failed to fetch publish command tasks` as string,
        {
          endpoint,
          commandId,
          url,
          params: queryParams,
          error: error.message,
          errorCode: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          requestDuration: `${requestDuration}ms`,
          isTimeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout'),
          errorData,
          errorDetails,
          errorResponseKeys: errorData ? Object.keys(errorData) : [],
          hasErrorsArray: !!(errorData.errors && Array.isArray(errorData.errors)),
          errorsCount: errorData.errors?.length || 0,
          firstError: errorData.errors?.[0] ? JSON.stringify(errorData.errors[0], null, 2) : undefined,
          userMessage: errorData.userMessage,
          message: errorData.message,
          code: errorData.code,
          path: errorData.path,
          errorDescription: errorData.error_description,
          responseHeaders: error.response?.headers ? JSON.stringify(error.response.headers) : undefined,
          timestamp: new Date().toISOString(),
        },
      );
      throw error;
    }
  }

  /**
   * Delete offer
   */
  async deleteOffer(offerId: string) {
    return this.request('DELETE', `/sale/offers/${offerId}`);
  }

  /**
   * Get orders
   */
  async getOrders(params?: any) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/order/orders${queryString ? `?${queryString}` : ''}`;
    return this.request('GET', endpoint);
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string) {
    return this.request('GET', `/order/orders/${orderId}`);
  }

  /**
   * Get categories
   */
  async getCategories(parentId?: string) {
    const endpoint = parentId ? `/sale/categories?parent.id=${parentId}` : '/sale/categories';
    return this.request('GET', endpoint);
  }

  /**
   * Get category by ID
   */
  async getCategory(categoryId: string) {
    return this.request('GET', `/sale/categories/${categoryId}`);
  }

  /**
   * Update offer stock
   */
  async updateOfferStock(offerId: string, quantity: number) {
    return this.request('PUT', `/sale/offers/${offerId}/change-quantity-commands`, {
      changeQuantityCommand: {
        offerId,
        quantity,
      },
    });
  }

  /**
   * Update offer price
   */
  async updateOfferPrice(offerId: string, price: number) {
    return this.request('PUT', `/sale/offers/${offerId}/change-price-commands`, {
      changePriceCommand: {
        offerId,
        buyNowPrice: {
          amount: price.toString(),
          currency: this.configService.get('PRICE_CURRENCY_TARGET') || 'PLN',
        },
      },
    });
  }

  /**
   * Get offer events (for event polling)
   * @param after - Event ID to start after (optional) - Allegro uses 'after' parameter
   * @param limit - Maximum number of events to return (default: 100)
   */
  async getOfferEvents(after?: string, limit: number = 100) {
    const params: any = { limit };
    if (after) {
      params.after = after;
    }
    const queryString = new URLSearchParams(params).toString();
    return this.request('GET', `/sale/offer-events?${queryString}`);
  }

  /**
   * Get order events (for event polling)
   * Note: Allegro may not have a dedicated /order/events endpoint
   * This method attempts to fetch order events, or returns empty if not available
   * @param after - Event ID to start after (optional)
   * @param limit - Maximum number of events to return (default: 100)
   */
  async getOrderEvents(after?: string, limit: number = 100) {
    // Try /order/events first, fallback to /order/orders if events endpoint doesn't exist
    try {
      const params: any = { limit };
      if (after) {
        params.after = after;
      }
      const queryString = new URLSearchParams(params).toString();
      return this.request('GET', `/order/events?${queryString}`);
    } catch (error: any) {
      // If /order/events doesn't exist, we'll handle order updates via order sync
      // Return empty events array
      this.logger.warn('Order events endpoint may not be available, using order sync instead');
      return { events: [], lastEventId: after || null };
    }
  }

  private throwConfigError(key: string): never {
    throw new Error(`Missing required environment variable: ${key}. Please set it in your .env file.`);
  }
}

