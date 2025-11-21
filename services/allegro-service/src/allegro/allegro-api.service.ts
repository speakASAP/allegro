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
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
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
      this.logger.error('Allegro API request failed', {
        method,
        endpoint,
        error: error.message,
        status: error.response?.status,
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
   * Get offer by ID
   */
  async getOffer(offerId: string) {
    return this.request('GET', `/sale/offers/${offerId}`);
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

  private throwConfigError(key: string): never {
    throw new Error(`Missing required environment variable: ${key}. Please set it in your .env file.`);
  }
}

