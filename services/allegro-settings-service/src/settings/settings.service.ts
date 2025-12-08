/**
 * Settings Service
 * Handles user settings and API key management
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService, LoggerService, NotificationService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { UpdateSettingsDto, AddSupplierConfigDto, UpdateSupplierConfigDto, ValidateAllegroKeysDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  private readonly encryptionKey: string;
  private readonly encryptionAlgorithm = 'aes-256-cbc';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly notificationService: NotificationService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Get encryption key from environment or generate a default (should be set in production)
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY') || 'default-encryption-key-change-in-production-32chars!!';
    if (this.encryptionKey.length < 32) {
      this.logger.warn('ENCRYPTION_KEY is too short, using default (not secure for production)');
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
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, Buffer.from(this.encryptionKey.slice(0, 32), 'utf8'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Get user settings
   */
  async getSettings(userId: string): Promise<any> {
    this.logger.log('Getting user settings', { userId });

    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      // Create default settings if they don't exist
      settings = await this.prisma.userSettings.create({
        data: {
          userId,
          supplierConfigs: [],
          preferences: {},
        },
      });
    }

    // Decrypt sensitive data before returning
    const result = { ...settings };
    if (result.allegroClientSecret) {
      try {
        result.allegroClientSecret = this.decrypt(result.allegroClientSecret);
      } catch (error) {
        this.logger.error('Failed to decrypt allegroClientSecret', { userId, error: error.message });
        result.allegroClientSecret = null;
      }
    }

    // Decrypt API keys in supplier configs
    if (result.supplierConfigs && Array.isArray(result.supplierConfigs)) {
      result.supplierConfigs = result.supplierConfigs.map((config: any) => {
        if (config.apiKey) {
          try {
            config.apiKey = this.decrypt(config.apiKey);
          } catch (error) {
            this.logger.error('Failed to decrypt supplier API key', { userId, supplierId: config.id, error: error.message });
            config.apiKey = null;
          }
        }
        return config;
      });
    }

    return result;
  }

  /**
   * Update user settings
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<any> {
    this.logger.log('Updating user settings', { userId });

    const updateData: any = {};

    if (dto.allegroClientId !== undefined) {
      updateData.allegroClientId = dto.allegroClientId;
    }

    if (dto.allegroClientSecret !== undefined) {
      // Encrypt the secret before storing
      updateData.allegroClientSecret = this.encrypt(dto.allegroClientSecret);
    }

    if (dto.supplierConfigs !== undefined) {
      // Encrypt API keys in supplier configs
      if (Array.isArray(dto.supplierConfigs)) {
        updateData.supplierConfigs = dto.supplierConfigs.map((config: any) => {
          if (config.apiKey && !config.apiKey.includes(':')) {
            // Only encrypt if not already encrypted (doesn't contain ':')
            config.apiKey = this.encrypt(config.apiKey);
          }
          return config;
        });
      } else {
        updateData.supplierConfigs = dto.supplierConfigs;
      }
    }

    if (dto.preferences !== undefined) {
      updateData.preferences = dto.preferences;
    }

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData,
        supplierConfigs: updateData.supplierConfigs || [],
        preferences: updateData.preferences || {},
      },
    });

    // Decrypt for response
    const result = { ...settings };
    if (result.allegroClientSecret) {
      try {
        result.allegroClientSecret = this.decrypt(result.allegroClientSecret);
      } catch (error) {
        result.allegroClientSecret = null;
      }
    }

    return result;
  }

  /**
   * Add supplier configuration
   */
  async addSupplierConfig(userId: string, dto: AddSupplierConfigDto): Promise<any> {
    this.logger.log('Adding supplier configuration', { userId, supplierName: dto.name });

    const settings = await this.getSettings(userId);
    const supplierConfigs = (settings.supplierConfigs || []) as any[];

    const newConfig = {
      id: crypto.randomUUID(),
      name: dto.name,
      apiEndpoint: dto.apiEndpoint,
      apiKey: this.encrypt(dto.apiKey),
      apiConfig: dto.apiConfig || {},
    };

    supplierConfigs.push(newConfig);

    await this.updateSettings(userId, { supplierConfigs });

    return {
      ...newConfig,
      apiKey: dto.apiKey, // Return decrypted for response
    };
  }

  /**
   * Update supplier configuration
   */
  async updateSupplierConfig(userId: string, supplierId: string, dto: UpdateSupplierConfigDto): Promise<any> {
    this.logger.log('Updating supplier configuration', { userId, supplierId });

    const settings = await this.getSettings(userId);
    const supplierConfigs = (settings.supplierConfigs || []) as any[];

    const configIndex = supplierConfigs.findIndex((c: any) => c.id === supplierId);
    if (configIndex === -1) {
      throw new NotFoundException(`Supplier configuration with ID ${supplierId} not found`);
    }

    const existingConfig = supplierConfigs[configIndex];

    if (dto.name !== undefined) {
      existingConfig.name = dto.name;
    }
    if (dto.apiEndpoint !== undefined) {
      existingConfig.apiEndpoint = dto.apiEndpoint;
    }
    if (dto.apiKey !== undefined) {
      existingConfig.apiKey = this.encrypt(dto.apiKey);
    }
    if (dto.apiConfig !== undefined) {
      existingConfig.apiConfig = dto.apiConfig;
    }

    supplierConfigs[configIndex] = existingConfig;

    await this.updateSettings(userId, { supplierConfigs });

    return {
      ...existingConfig,
      apiKey: dto.apiKey !== undefined ? dto.apiKey : this.decrypt(existingConfig.apiKey),
    };
  }

  /**
   * Remove supplier configuration
   */
  async removeSupplierConfig(userId: string, supplierId: string): Promise<void> {
    this.logger.log('Removing supplier configuration', { userId, supplierId });

    const settings = await this.getSettings(userId);
    const supplierConfigs = (settings.supplierConfigs || []) as any[];

    const filteredConfigs = supplierConfigs.filter((c: any) => c.id !== supplierId);

    if (filteredConfigs.length === supplierConfigs.length) {
      throw new NotFoundException(`Supplier configuration with ID ${supplierId} not found`);
    }

    await this.updateSettings(userId, { supplierConfigs: filteredConfigs });
  }

  /**
   * Validate Allegro API keys
   */
  async validateAllegroKeys(userId: string, dto: ValidateAllegroKeysDto): Promise<{ valid: boolean; message?: string }> {
    // Always use real ALLEGRO_AUTH_URL for both environments
    const tokenUrl = this.configService.get<string>('ALLEGRO_AUTH_URL') || 'https://allegro.pl/auth/oauth/token';
    
    this.logger.log('Validating Allegro API keys', { 
      userId,
      tokenUrl,
      clientId: dto.clientId.substring(0, 8) + '...', // Log partial ID for debugging
    });

    try {
      // Use the same authentication method as allegro-auth.service
      const response = await firstValueFrom(
        this.httpService.post(
          tokenUrl,
          new URLSearchParams({
            grant_type: 'client_credentials',
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            auth: {
              username: dto.clientId,
              password: dto.clientSecret,
            },
            timeout: 10000,
          },
        ),
      );

      if (response.data && response.data.access_token) {
        this.logger.log('Allegro API keys validated successfully', { userId });
        return { valid: true, message: 'Validated successfully' };
      }

      return { valid: false, message: 'Invalid response from Allegro API' };
    } catch (error: any) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message;
      
      this.logger.error('Failed to validate Allegro API keys', {
        userId,
        error: errorMessage,
        status,
        tokenUrl,
      });

      if (status === 401 || status === 403) {
        return { valid: false, message: 'Invalid API credentials. Please check your Client ID and Client Secret.' };
      }

      if (status === 404) {
        return { valid: false, message: `OAuth endpoint not found. Please check ALLEGRO_AUTH_URL configuration.` };
      }

      return { valid: false, message: `Validation failed: ${errorMessage || error.message}` };
    }
  }

  /**
   * Store Allegro OAuth tokens
   */
  async storeAllegroOAuthTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    scopes?: string,
  ): Promise<void> {
    this.logger.log('Storing Allegro OAuth tokens', { userId, expiresIn, scopes });

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        allegroAccessToken: this.encrypt(accessToken),
        allegroRefreshToken: this.encrypt(refreshToken),
        allegroTokenExpiresAt: expiresAt,
        allegroTokenScopes: scopes,
        // Clear OAuth state and code verifier after successful authorization
        allegroOAuthState: null,
        allegroOAuthCodeVerifier: null,
      },
      create: {
        userId,
        allegroAccessToken: this.encrypt(accessToken),
        allegroRefreshToken: this.encrypt(refreshToken),
        allegroTokenExpiresAt: expiresAt,
        allegroTokenScopes: scopes,
        supplierConfigs: [],
        preferences: {},
      },
    });

    this.logger.log('Allegro OAuth tokens stored successfully', { userId, expiresAt });
  }

  /**
   * Get Allegro OAuth status
   */
  async getAllegroOAuthStatus(userId: string): Promise<{ authorized: boolean; expiresAt?: Date; scopes?: string }> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: {
        allegroAccessToken: true,
        allegroTokenExpiresAt: true,
        allegroTokenScopes: true,
      },
    });

    if (!settings?.allegroAccessToken) {
      return { authorized: false };
    }

    return {
      authorized: true,
      expiresAt: settings.allegroTokenExpiresAt || undefined,
      scopes: settings.allegroTokenScopes || undefined,
    };
  }

  /**
   * Revoke Allegro OAuth authorization (clear tokens)
   */
  async revokeAllegroOAuth(userId: string): Promise<void> {
    this.logger.log('Revoking Allegro OAuth authorization', { userId });

    await this.prisma.userSettings.update({
      where: { userId },
      data: {
        allegroAccessToken: null,
        allegroRefreshToken: null,
        allegroTokenExpiresAt: null,
        allegroTokenScopes: null,
        allegroOAuthState: null,
        allegroOAuthCodeVerifier: null,
      },
    });

    this.logger.log('Allegro OAuth authorization revoked', { userId });
  }

  /**
   * Store OAuth state and code verifier (for PKCE)
   */
  async storeOAuthState(
    userId: string,
    state: string,
    codeVerifier: string,
  ): Promise<void> {
    await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        allegroOAuthState: state,
        allegroOAuthCodeVerifier: this.encrypt(codeVerifier),
      },
      create: {
        userId,
        allegroOAuthState: state,
        allegroOAuthCodeVerifier: this.encrypt(codeVerifier),
        supplierConfigs: [],
        preferences: {},
      },
    });
  }

  /**
   * Get OAuth state and code verifier
   */
  async getOAuthState(userId: string): Promise<{ state: string; codeVerifier: string } | null> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: {
        allegroOAuthState: true,
        allegroOAuthCodeVerifier: true,
      },
    });

    if (!settings?.allegroOAuthState || !settings?.allegroOAuthCodeVerifier) {
      return null;
    }

    try {
      return {
        state: settings.allegroOAuthState,
        codeVerifier: this.decrypt(settings.allegroOAuthCodeVerifier),
      };
    } catch (error) {
      this.logger.error('Failed to decrypt OAuth code verifier', { userId, error: error.message });
      return null;
    }
  }
}
