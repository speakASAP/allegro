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
    const token = await this.getAccessToken();
    const url = `${this.apiUrl}${endpoint}`;

    try {
      // Allegro API requires application/vnd.allegro.public.v1+json for PUT/POST requests
      const contentType = (method.toUpperCase() === 'PUT' || method.toUpperCase() === 'POST')
        ? 'application/vnd.allegro.public.v1+json'
        : 'application/json';

      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': contentType,
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
      };

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
        case 'DELETE':
          response = await firstValueFrom(this.httpService.delete(url, config));
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
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
   * Create offer
   */
  async createOffer(data: any) {
    return this.request('POST', '/sale/offers', data);
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

    try {
      const config = {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/vnd.allegro.public.v1+json',
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
        timeout: 60000, // 60 seconds timeout for updating offer (Allegro API can be slow)
      };

      // Use PATCH for partial updates (recommended by Allegro)
      // For full updates, use PUT with complete offer data
      const response = await firstValueFrom(this.httpService.patch(url, data, config));
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
      });
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

