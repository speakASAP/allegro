/**
 * Allegro Authentication Service
 * Handles OAuth 2.0 authentication with Allegro
 */

import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '@allegro/shared';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

@Injectable()
export class AllegroAuthService {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly useSandbox: boolean;
  private readonly authUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.clientId = this.configService.get('ALLEGRO_CLIENT_ID') || this.throwConfigError('ALLEGRO_CLIENT_ID');
    this.clientSecret = this.configService.get('ALLEGRO_CLIENT_SECRET') || this.throwConfigError('ALLEGRO_CLIENT_SECRET');
    this.useSandbox = this.configService.get('ALLEGRO_USE_SANDBOX') === 'true';
    this.authUrl = this.useSandbox
      ? this.configService.get('ALLEGRO_AUTH_SANDBOX_URL') || this.throwConfigError('ALLEGRO_AUTH_SANDBOX_URL')
      : this.configService.get('ALLEGRO_AUTH_URL') || this.throwConfigError('ALLEGRO_AUTH_URL');
  }

  /**
   * Get access token (with caching and auto-refresh)
   */
  async getAccessToken(): Promise<string> {
    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Request new token
    await this.requestNewToken();
    return this.accessToken!;
  }

  /**
   * Request new access token using client credentials
   */
  private async requestNewToken(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TokenResponse>(
          this.authUrl,
          new URLSearchParams({
            grant_type: 'client_credentials',
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            auth: {
              username: this.clientId,
              password: this.clientSecret,
            },
          },
        ),
      );

      this.accessToken = response.data.access_token;
      // Set expiry 5 minutes before actual expiry for safety
      const expiresIn = response.data.expires_in - 300;
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

      this.logger.log('Allegro access token obtained', {
        expiresIn: expiresIn,
      });
    } catch (error: any) {
      this.logger.error('Failed to obtain Allegro access token', {
        error: error.message,
        status: error.response?.status,
      });
      throw new Error('Failed to authenticate with Allegro API');
    }
  }

  private throwConfigError(key: string): never {
    throw new Error(`Missing required environment variable: ${key}. Please set it in your .env file.`);
  }
}

