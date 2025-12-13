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
    // Get encryption key from environment - required for security
    // In production (Docker), ENCRYPTION_KEY is passed as environment variable
    // In development, it should be loaded by ConfigModule from .env file
    // Try multiple sources to match production behavior
    let encryptionKey = this.configService.get<string>('ENCRYPTION_KEY') || process.env.ENCRYPTION_KEY;
    
    // If key is missing or too short, try reading directly from .env file (fallback for dev)
    if (!encryptionKey || encryptionKey.length < 32) {
      const fs = require('fs');
      const path = require('path');
      // Try multiple possible paths
      const possiblePaths = [
        path.join(process.cwd(), '../../.env'), // From service directory
        path.join(process.cwd(), '.env'), // From project root if running from there
      ];
      
      // Add __dirname path if available (for compiled code in production)
      if (typeof __dirname !== 'undefined') {
        possiblePaths.push(path.resolve(__dirname, '../../../.env'));
      }
      
      for (const envPath of possiblePaths) {
        try {
          if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            // Match ENCRYPTION_KEY=value (handle special characters, no quotes needed)
            const keyMatch = envContent.match(/^ENCRYPTION_KEY=(.+)$/m);
            if (keyMatch) {
              // Remove quotes if present and trim
              const extractedKey = keyMatch[1].trim().replace(/^["']|["']$/g, '');
              if (extractedKey && extractedKey.length >= 32) {
                encryptionKey = extractedKey;
                this.logger.log(`ENCRYPTION_KEY loaded from file: ${envPath}`);
                break;
              }
            }
          }
        } catch (error) {
          // Continue to next path
          continue;
        }
      }
    }
    
    this.encryptionKey = encryptionKey;
    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_KEY must be configured in .env file or as environment variable');
    }
    // Log key length for debugging (first 10 chars only for security)
    this.logger.log(`ENCRYPTION_KEY loaded, length: ${this.encryptionKey.length}, first 10 chars: ${this.encryptionKey.substring(0, 10)}`);
    if (this.encryptionKey.length < 32) {
      throw new Error(`ENCRYPTION_KEY must be at least 32 characters long (current length: ${this.encryptionKey.length})`);
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
    this.logger.log('SettingsService.getSettings START', { userId });

    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    this.logger.log('SettingsService.getSettings: Database query completed', {
      userId,
      found: !!settings,
      hasClientId: !!settings?.allegroClientId,
      hasClientSecret: !!settings?.allegroClientSecret,
      clientSecretLength: settings?.allegroClientSecret?.length,
    });

    if (!settings) {
      this.logger.log('SettingsService.getSettings: No settings found, creating default', { userId });
      // Create default settings if they don't exist
      settings = await this.prisma.userSettings.create({
        data: {
          userId,
          supplierConfigs: [],
          preferences: {},
        },
      });
      this.logger.log('SettingsService.getSettings: Default settings created', {
        userId,
        settingsId: settings.id,
      });
    }

    // Decrypt sensitive data before returning
    this.logger.log('SettingsService.getSettings: Preparing to decrypt Client Secret', {
      userId,
      hasClientSecret: !!settings.allegroClientSecret,
      clientSecretLength: settings.allegroClientSecret?.length,
    });
    
    const result: any = { ...settings };
    
    if (result.allegroClientSecret) {
      this.logger.log('SettingsService.getSettings: Attempting to decrypt Client Secret', {
        userId,
        encryptedLength: result.allegroClientSecret.length,
        encryptedFirstChars: result.allegroClientSecret.substring(0, 20) + '...',
      });
      
      try {
        const decryptedSecret = this.decrypt(result.allegroClientSecret);
        result.allegroClientSecret = decryptedSecret;
        
        this.logger.log('SettingsService.getSettings: Client Secret decrypted successfully', {
          userId,
          decryptedLength: decryptedSecret.length,
          decryptedFirstChars: decryptedSecret.substring(0, 5) + '...',
        });
      } catch (error: any) {
        this.logger.error('SettingsService.getSettings: Failed to decrypt allegroClientSecret', {
          userId,
          error: error.message,
          errorStack: error.stack,
          encryptedLength: result.allegroClientSecret?.length,
        });
        
        // Set to null to indicate it exists but decryption failed
        result.allegroClientSecret = null;
        
        // Add detailed error information
        result._allegroClientSecretDecryptionError = {
          exists: true,
          error: error.message || 'Unknown decryption error',
          errorType: error.constructor?.name || 'Error',
          suggestion: 'This usually happens when the encryption key has changed or the data was encrypted with a different key. Please re-enter your Client Secret.',
        };
        
        this.logger.log('SettingsService.getSettings: Added decryption error to response', {
          userId,
          errorInfo: result._allegroClientSecretDecryptionError,
        });
      }
    } else {
      this.logger.log('SettingsService.getSettings: No Client Secret in database', { userId });
    }

    this.logger.log('SettingsService.getSettings: Returning result', {
      userId,
      resultKeys: Object.keys(result),
      hasClientId: !!result.allegroClientId,
      hasClientSecret: !!result.allegroClientSecret,
      clientSecretLength: result.allegroClientSecret?.length,
      hasDecryptionError: !!result._allegroClientSecretDecryptionError,
    });

    return result;

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
    const startLogData = {
      userId,
      hasClientId: !!dto.allegroClientId,
      clientId: dto.allegroClientId?.substring(0, 8) + '...',
      clientIdLength: dto.allegroClientId?.length,
      hasClientSecret: !!dto.allegroClientSecret,
      clientSecretLength: dto.allegroClientSecret?.length,
      clientSecretFirstChars: dto.allegroClientSecret?.substring(0, 5) + '...',
      dtoKeys: Object.keys(dto),
    };
    this.logger.log('SettingsService.updateSettings START', startLogData);
    console.log('[SettingsService] updateSettings START', JSON.stringify(startLogData, null, 2));

    const updateData: any = {};

    if (dto.allegroClientId !== undefined) {
      updateData.allegroClientId = dto.allegroClientId;
      const logData = { userId, clientIdLength: updateData.allegroClientId?.length };
      this.logger.log('SettingsService.updateSettings: Added Client ID to updateData', logData);
      console.log('[SettingsService] Added Client ID to updateData', JSON.stringify(logData, null, 2));
    } else {
      this.logger.log('SettingsService.updateSettings: Client ID not provided', { userId });
      console.log('[SettingsService] Client ID not provided', { userId });
    }

    if (dto.allegroClientSecret !== undefined) {
      const encryptLogData = {
        userId,
        clientSecretLength: dto.allegroClientSecret.length,
        clientSecretFirstChars: dto.allegroClientSecret.substring(0, 5) + '...',
      };
      this.logger.log('SettingsService.updateSettings: Encrypting Client Secret', encryptLogData);
      console.log('[SettingsService] Encrypting Client Secret', JSON.stringify(encryptLogData, null, 2));
      
      try {
        // Encrypt the secret before storing
        const encryptedSecret = this.encrypt(dto.allegroClientSecret);
        updateData.allegroClientSecret = encryptedSecret;
        
        const successLogData = {
          userId,
          encryptedLength: encryptedSecret.length,
          encryptedFirstChars: encryptedSecret.substring(0, 20) + '...',
        };
        this.logger.log('SettingsService.updateSettings: Client Secret encrypted successfully', successLogData);
        console.log('[SettingsService] Client Secret encrypted successfully', JSON.stringify(successLogData, null, 2));
      } catch (error: any) {
        const errorLogData = {
          userId,
          error: error.message,
          errorStack: error.stack,
        };
        this.logger.error('SettingsService.updateSettings: Failed to encrypt Client Secret', errorLogData);
        console.error('[SettingsService] Failed to encrypt Client Secret', JSON.stringify(errorLogData, null, 2));
        throw error;
      }
    } else {
      this.logger.log('SettingsService.updateSettings: Client Secret not provided', { userId });
      console.log('[SettingsService] Client Secret not provided', { userId });
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

    const upsertLogData = {
      userId,
      updateDataKeys: Object.keys(updateData),
      hasClientId: !!updateData.allegroClientId,
      hasClientSecret: !!updateData.allegroClientSecret,
      clientSecretEncryptedLength: updateData.allegroClientSecret?.length,
    };
    this.logger.log('SettingsService.updateSettings: Preparing database upsert', upsertLogData);
    console.log('[SettingsService] Preparing database upsert', JSON.stringify(upsertLogData, null, 2));
    
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
    
    const completedLogData = {
      userId,
      settingsId: settings.id,
      hasStoredClientId: !!settings.allegroClientId,
      hasStoredClientSecret: !!settings.allegroClientSecret,
      storedClientSecretLength: settings.allegroClientSecret?.length,
    };
    this.logger.log('SettingsService.updateSettings: Database upsert completed', completedLogData);
    console.log('[SettingsService] Database upsert completed', JSON.stringify(completedLogData, null, 2));

    // Decrypt for response
    this.logger.log('SettingsService.updateSettings: Preparing response', {
      userId,
      hasStoredClientSecret: !!settings.allegroClientSecret,
      storedClientSecretLength: settings.allegroClientSecret?.length,
    });
    
    const result: any = { ...settings };
    
    if (result.allegroClientSecret) {
      this.logger.log('SettingsService.updateSettings: Attempting to decrypt Client Secret for response', {
        userId,
        encryptedLength: result.allegroClientSecret.length,
        encryptedFirstChars: result.allegroClientSecret.substring(0, 20) + '...',
      });
      
      try {
        const decryptedSecret = this.decrypt(result.allegroClientSecret);
        result.allegroClientSecret = decryptedSecret;
        
        this.logger.log('SettingsService.updateSettings: Client Secret decrypted successfully', { 
          userId, 
          decryptedLength: decryptedSecret.length,
          decryptedFirstChars: decryptedSecret.substring(0, 5) + '...',
        });
      } catch (error: any) {
        this.logger.error('SettingsService.updateSettings: Failed to decrypt Client Secret', { 
          userId, 
          error: error.message, 
          errorStack: error.stack,
          encryptedLength: result.allegroClientSecret?.length,
        });
        
        // Set to null to indicate it exists but decryption failed
        result.allegroClientSecret = null;
        
        // Add detailed error information (same as getSettings)
        result._allegroClientSecretDecryptionError = {
          exists: true,
          error: error.message || 'Unknown decryption error',
          errorType: error.constructor?.name || 'Error',
          suggestion: 'This usually happens when the encryption key has changed or the data was encrypted with a different key. Please re-enter your Client Secret.',
        };
        
        this.logger.log('SettingsService.updateSettings: Added decryption error to response', {
          userId,
          errorInfo: result._allegroClientSecretDecryptionError,
        });
      }
    } else {
      this.logger.log('SettingsService.updateSettings: No Client Secret in database', { userId });
    }

    this.logger.log('SettingsService.updateSettings: Returning result', {
      userId,
      resultKeys: Object.keys(result),
      hasClientId: !!result.allegroClientId,
      hasClientSecret: !!result.allegroClientSecret,
      clientSecretLength: result.allegroClientSecret?.length,
      hasDecryptionError: !!result._allegroClientSecretDecryptionError,
    });

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
    const tokenUrl = this.configService.get<string>('ALLEGRO_AUTH_URL');
    if (!tokenUrl) {
      throw new Error('ALLEGRO_AUTH_URL must be configured in .env file');
    }
    
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
            timeout: (() => {
              const authTimeout = this.configService.get<string>('AUTH_SERVICE_TIMEOUT');
              const httpTimeout = this.configService.get<string>('HTTP_TIMEOUT');
              const timeout = authTimeout || httpTimeout;
              if (!timeout) {
                throw new Error('AUTH_SERVICE_TIMEOUT or HTTP_TIMEOUT must be configured in .env file');
              }
              return parseInt(timeout);
            })(),
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
