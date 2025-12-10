/**
 * Allegro Authentication Service
 * Handles OAuth 2.0 authentication with Allegro
 */

import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LoggerService, PrismaService } from '@allegro/shared';
import { AllegroOAuthService } from './allegro-oauth.service';
import * as crypto from 'crypto';

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
  private readonly encryptionKey: string;
  private readonly encryptionAlgorithm = 'aes-256-cbc';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly oauthService: AllegroOAuthService,
  ) {
    // Allow service to start without credentials (will fail when actually using Allegro API)
    this.clientId = this.configService.get('ALLEGRO_CLIENT_ID') || '';
    this.clientSecret = this.configService.get('ALLEGRO_CLIENT_SECRET') || '';
    this.useSandbox = this.configService.get('ALLEGRO_USE_SANDBOX') === 'true';
    this.authUrl = this.useSandbox
      ? this.configService.get('ALLEGRO_AUTH_SANDBOX_URL') || this.throwConfigError('ALLEGRO_AUTH_SANDBOX_URL')
      : this.configService.get('ALLEGRO_AUTH_URL') || this.throwConfigError('ALLEGRO_AUTH_URL');
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_KEY must be configured in .env file');
    }
    if (this.encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.encryptionAlgorithm, Buffer.from(this.encryptionKey.slice(0, 32), 'utf8'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, Buffer.from(this.encryptionKey.slice(0, 32), 'utf8'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Get user's OAuth access token (with auto-refresh)
   */
  async getUserAccessToken(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings?.allegroAccessToken) {
      throw new Error('OAuth authorization required. Please authorize the application in Settings.');
    }

    // Check if token is expired (with 5-minute buffer)
    const expiresAt = settings.allegroTokenExpiresAt;
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes

    if (expiresAt && new Date(expiresAt.getTime() - bufferTime) <= now) {
      // Token expires soon or is expired, refresh it
      this.logger.log('OAuth token expired or expiring soon, refreshing', { userId });
      return await this.refreshUserToken(userId);
    }

    // Decrypt and return access token
    try {
      const accessToken = this.decrypt(settings.allegroAccessToken);
      return accessToken;
    } catch (error) {
      this.logger.error('Failed to decrypt OAuth access token', { userId, error: error.message });
      throw new Error('Failed to decrypt OAuth token. Please re-authorize.');
    }
  }

  /**
   * Refresh user's OAuth access token
   */
  async refreshUserToken(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings?.allegroRefreshToken) {
      throw new Error('Refresh token not found. Please re-authorize the application.');
    }

    if (!settings?.allegroClientId || !settings?.allegroClientSecret) {
      throw new Error('Allegro API credentials not found. Please configure them in Settings.');
    }

    try {
      // Decrypt refresh token and client secret
      const refreshToken = this.decrypt(settings.allegroRefreshToken);
      const clientSecret = this.decrypt(settings.allegroClientSecret);

      // Refresh token via OAuth service
      const tokenResponse = await this.oauthService.refreshAccessToken(
        refreshToken,
        settings.allegroClientId,
        clientSecret,
      );

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

      // Encrypt and store new tokens
      const encryptedAccessToken = this.encrypt(tokenResponse.access_token);
      const encryptedRefreshToken = tokenResponse.refresh_token
        ? this.encrypt(tokenResponse.refresh_token)
        : settings.allegroRefreshToken; // Keep existing if not provided

      await this.prisma.userSettings.update({
        where: { userId },
        data: {
          allegroAccessToken: encryptedAccessToken,
          allegroRefreshToken: encryptedRefreshToken,
          allegroTokenExpiresAt: expiresAt,
        },
      });

      this.logger.log('Successfully refreshed OAuth token', { userId, expiresAt });
      return tokenResponse.access_token;
    } catch (error) {
      this.logger.error('Failed to refresh OAuth token', { userId, error: error.message });
      throw new Error(`Failed to refresh token: ${error.message}. Please re-authorize.`);
    }
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
   * Get access token with custom credentials (for user-specific API keys)
   */
  async getAccessTokenWithCredentials(clientId: string, clientSecret: string): Promise<string> {
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
              username: clientId,
              password: clientSecret,
            },
          },
        ),
      );

      // Log token info for debugging (without exposing the actual token)
      this.logger.debug('Allegro access token obtained with custom credentials', {
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in,
        hasRefreshToken: !!response.data.refresh_token,
        // Note: client_credentials grant doesn't provide scopes in response
        // To access user resources like /sale/offers, OAuth authorization code flow is required
      });

      return response.data.access_token;
    } catch (error: any) {
      this.logger.error('Failed to obtain Allegro access token with custom credentials', {
        error: error.message,
        status: error.response?.status,
        errorData: error.response?.data,
      });
      throw new Error(`Failed to authenticate with Allegro API: ${error.response?.data?.error_description || error.message}`);
    }
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

