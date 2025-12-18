/**
 * Settings Service
 * Handles user settings and API key management
 */

import { Injectable, NotFoundException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService, LoggerService, NotificationService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { UpdateSettingsDto, AddSupplierConfigDto, UpdateSupplierConfigDto, ValidateAllegroKeysDto, ValidateAllegroAccountKeysDto, CreateAllegroAccountDto, UpdateAllegroAccountDto } from './dto/update-settings.dto';

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
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    this.logger.log(`[${timestamp}] [TIMING] SettingsService.getSettings START for userId: ${userId}`);
    this.logger.log('SettingsService.getSettings START', { userId });

    const dbQueryStartTime = Date.now();
    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        supplierConfigs: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const dbQueryDuration = Date.now() - dbQueryStartTime;
    this.logger.log(`[${new Date().toISOString()}] [TIMING] SettingsService.getSettings: Database query completed (${dbQueryDuration}ms)`, {
      userId,
      found: !!settings,
    });

    this.logger.log('SettingsService.getSettings: Database query completed', {
      userId,
      found: !!settings,
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

    const result: any = { ...settings };

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

    // Get Allegro accounts for user
    const accounts = await this.prisma.allegroAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    // Decrypt account credentials and add OAuth status
    result.allegroAccounts = await Promise.all(accounts.map(async (account) => {
      const accountData: any = {
        id: account.id,
        name: account.name,
        isActive: account.isActive,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      };

      // Decrypt client secret if present
      if (account.clientSecret) {
        try {
          accountData.clientId = account.clientId;
          accountData.clientSecret = this.decrypt(account.clientSecret);
        } catch (error: any) {
          this.logger.error('Failed to decrypt account client secret', {
            userId,
            accountId: account.id,
            error: error.message,
          });
          accountData.clientId = account.clientId;
          accountData.clientSecret = null;
          accountData._clientSecretDecryptionError = {
            exists: true,
            error: error.message || 'Unknown decryption error',
            errorType: error.constructor?.name || 'Error',
            suggestion: 'Please re-enter your Client Secret.',
          };
        }
      } else {
        accountData.clientId = account.clientId;
      }

      // Add OAuth status
      if (account.accessToken) {
        accountData.oauthStatus = {
          authorized: true,
          expiresAt: account.tokenExpiresAt ? (account.tokenExpiresAt instanceof Date ? account.tokenExpiresAt.toISOString() : account.tokenExpiresAt) : undefined,
          scopes: account.tokenScopes || undefined,
        };
      } else {
        accountData.oauthStatus = {
          authorized: false,
        };
      }

      return accountData;
    }));

    // Get active account ID from preferences
    const preferences = (result.preferences || {}) as any;
    result.activeAllegroAccountId = preferences.activeAllegroAccountId || null;

    const totalDuration = Date.now() - startTime;
    this.logger.log(`[${new Date().toISOString()}] [TIMING] SettingsService.getSettings: Returning result (${totalDuration}ms total)`, {
      userId,
      resultKeys: Object.keys(result),
      accountsCount: result.allegroAccounts?.length || 0,
      activeAccountId: result.activeAllegroAccountId,
      totalDurationMs: totalDuration,
    });

    return result;
  }

  /**
   * Update user settings
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<any> {
    const startLogData = {
      userId,
      dtoKeys: Object.keys(dto),
    };
    this.logger.log('SettingsService.updateSettings START', startLogData);

    const updateData: any = {};

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
    
    this.logger.log('SettingsService.updateSettings: Database upsert completed', {
      userId,
      settingsId: settings.id,
    });

    const result: any = { ...settings };

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
      this.logger.error('ALLEGRO_AUTH_URL not configured', { userId });
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'ALLEGRO_AUTH_URL must be configured in .env file',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
              // Use longer timeout for Allegro API validation (external API call)
              // Check for specific timeout for Allegro validation, otherwise use default
              const allegroTimeout = this.configService.get<string>('ALLEGRO_VALIDATION_TIMEOUT');
              if (allegroTimeout) {
                return parseInt(allegroTimeout);
              }
              // Default to 60 seconds for Allegro API validation (external API can be very slow)
              const defaultAllegroTimeout = 60000;
              const authTimeout = this.configService.get<string>('AUTH_SERVICE_TIMEOUT');
              const httpTimeout = this.configService.get<string>('HTTP_TIMEOUT');
              const timeout = authTimeout || httpTimeout;
              if (!timeout) {
                // If no timeout configured, use default for Allegro validation
                this.logger.log('No timeout configured, using default 60s for Allegro validation', { userId });
                return defaultAllegroTimeout;
              }
              // Use configured timeout, but ensure minimum 60 seconds for external API
              const configuredTimeout = parseInt(timeout);
              return Math.max(configuredTimeout, defaultAllegroTimeout);
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
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error || error.message;
      const errorCode = errorData.error_code || error.code;
      
      this.logger.error('Failed to validate Allegro API keys', {
        userId,
        error: errorMessage,
        status,
        statusText: error.response?.statusText,
        errorCode,
        errorData: JSON.stringify(errorData),
        tokenUrl,
        clientIdPrefix: dto.clientId ? dto.clientId.substring(0, 8) + '...' : 'missing',
        hasClientSecret: !!dto.clientSecret,
        clientSecretLength: dto.clientSecret?.length || 0,
      });

      if (status === 401 || status === 403) {
        // Provide more specific error message if available from Allegro
        const specificMessage = errorData.error_description || errorData.error;
        if (specificMessage && specificMessage !== 'invalid_client') {
          return { valid: false, message: `Invalid API credentials: ${specificMessage}` };
        }
        return { valid: false, message: 'Invalid API credentials. Please check your Client ID and Client Secret.' };
      }

      if (status === 404) {
        return { valid: false, message: `OAuth endpoint not found. Please check ALLEGRO_AUTH_URL configuration.` };
      }

      // Include more details in error message for debugging
      const detailedMessage = errorMessage 
        ? `Validation failed: ${errorMessage}${status ? ` (HTTP ${status})` : ''}`
        : `Validation failed: ${error.message || 'Unknown error'}`;
      
      return { valid: false, message: detailedMessage };
    }
  }

  // NOTE: Old OAuth methods removed - OAuth is now handled per account in AllegroAccount model
  // These methods are deprecated and should not be used:
  // - storeAllegroOAuthTokens (use OAuth controller which stores in AllegroAccount)
  // - getAllegroOAuthStatus (use account-specific OAuth status)
  // - revokeAllegroOAuth (use account-specific revoke)
  // - storeOAuthState (use account-specific OAuth state in AllegroAccount)
  // - getOAuthState (use account-specific OAuth state in AllegroAccount)

  /**
   * Get all Allegro accounts for user
   */
  async getAllegroAccounts(userId: string): Promise<any[]> {
    this.logger.log('Getting Allegro accounts', { userId });

    try {
      const accounts = await this.prisma.allegroAccount.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      
      this.logger.log('Found Allegro accounts', { userId, count: accounts.length });

      return await Promise.all(accounts.map(async (account) => {
        const accountData: any = {
          id: account.id,
          name: account.name,
          isActive: account.isActive,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        };

        // Decrypt client secret if present
        if (account.clientSecret) {
          try {
            accountData.clientId = account.clientId;
            accountData.clientSecret = this.decrypt(account.clientSecret);
          } catch (error: any) {
            this.logger.error('Failed to decrypt account client secret', {
              userId,
              accountId: account.id,
              error: error.message,
            });
            accountData.clientId = account.clientId;
            accountData.clientSecret = null;
          }
        } else {
          accountData.clientId = account.clientId;
        }

        // Add OAuth status
        if (account.accessToken) {
          accountData.oauthStatus = {
            authorized: true,
            expiresAt: account.tokenExpiresAt ? (account.tokenExpiresAt instanceof Date ? account.tokenExpiresAt.toISOString() : account.tokenExpiresAt) : undefined,
            scopes: account.tokenScopes || undefined,
          };
        } else {
          accountData.oauthStatus = {
            authorized: false,
          };
        }

        return accountData;
      }));
    } catch (error: any) {
      this.logger.error('Error getting Allegro accounts', { userId, error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Get specific Allegro account
   */
  async getAllegroAccount(userId: string, accountId: string): Promise<any> {
    this.logger.log('Getting Allegro account', { userId, accountId });

    const account = await this.prisma.allegroAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      throw new NotFoundException(`Allegro account with ID ${accountId} not found`);
    }

    const accountData: any = {
      id: account.id,
      name: account.name,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    // Decrypt client secret if present
    if (account.clientSecret) {
      try {
        accountData.clientId = account.clientId;
        accountData.clientSecret = this.decrypt(account.clientSecret);
      } catch (error: any) {
        this.logger.error('Failed to decrypt account client secret', {
          userId,
          accountId: account.id,
          error: error.message,
        });
        accountData.clientId = account.clientId;
        accountData.clientSecret = null;
      }
    } else {
      accountData.clientId = account.clientId;
    }

    // Add OAuth status
    if (account.accessToken) {
      accountData.oauthStatus = {
        authorized: true,
        expiresAt: account.tokenExpiresAt ? (account.tokenExpiresAt instanceof Date ? account.tokenExpiresAt.toISOString() : account.tokenExpiresAt) : undefined,
        scopes: account.tokenScopes || undefined,
      };
    } else {
      accountData.oauthStatus = {
        authorized: false,
      };
    }

    return accountData;
  }

  /**
   * Create new Allegro account
   */
  async createAllegroAccount(userId: string, dto: CreateAllegroAccountDto): Promise<any> {
    this.logger.log('Creating Allegro account', { userId, accountName: dto.name });

    // Check if account name already exists for this user
    const existing = await this.prisma.allegroAccount.findFirst({
      where: {
        userId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new BadRequestException(`Account with name "${dto.name}" already exists`);
    }

    const account = await this.prisma.allegroAccount.create({
      data: {
        userId,
        name: dto.name,
        clientId: dto.clientId,
        clientSecret: this.encrypt(dto.clientSecret),
        isActive: false,
      },
    });

    this.logger.log('Allegro account created', { userId, accountId: account.id, accountName: dto.name });

    return {
      id: account.id,
      name: account.name,
      clientId: account.clientId,
      isActive: account.isActive,
      oauthStatus: {
        authorized: false,
      },
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  /**
   * Update Allegro account
   */
  async updateAllegroAccount(userId: string, accountId: string, dto: UpdateAllegroAccountDto): Promise<any> {
    this.logger.log('Updating Allegro account', { userId, accountId });

    const account = await this.prisma.allegroAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      throw new NotFoundException(`Allegro account with ID ${accountId} not found`);
    }

    // Check if name is being changed and if new name already exists
    if (dto.name && dto.name !== account.name) {
      const existing = await this.prisma.allegroAccount.findFirst({
        where: {
          userId,
          name: dto.name,
          id: { not: accountId },
        },
      });

      if (existing) {
        throw new BadRequestException(`Account with name "${dto.name}" already exists`);
      }
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.clientId !== undefined) updateData.clientId = dto.clientId;
    if (dto.clientSecret !== undefined) updateData.clientSecret = this.encrypt(dto.clientSecret);

    const updated = await this.prisma.allegroAccount.update({
      where: { id: accountId },
      data: updateData,
    });

    this.logger.log('Allegro account updated', { userId, accountId });

    const accountData: any = {
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    // Decrypt client secret if present
    if (updated.clientSecret) {
      try {
        accountData.clientId = updated.clientId;
        accountData.clientSecret = this.decrypt(updated.clientSecret);
      } catch (error: any) {
        this.logger.error('Failed to decrypt account client secret', {
          userId,
          accountId: updated.id,
          error: error.message,
        });
        accountData.clientId = updated.clientId;
        accountData.clientSecret = null;
      }
    } else {
      accountData.clientId = updated.clientId;
    }

    // Add OAuth status
    if (updated.accessToken) {
      accountData.oauthStatus = {
        authorized: true,
        expiresAt: updated.tokenExpiresAt ? (updated.tokenExpiresAt instanceof Date ? updated.tokenExpiresAt.toISOString() : updated.tokenExpiresAt) : undefined,
        scopes: updated.tokenScopes || undefined,
      };
    } else {
      accountData.oauthStatus = {
        authorized: false,
      };
    }

    return accountData;
  }

  /**
   * Delete Allegro account
   */
  async deleteAllegroAccount(userId: string, accountId: string): Promise<void> {
    this.logger.log('Deleting Allegro account', { userId, accountId });

    const account = await this.prisma.allegroAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      throw new NotFoundException(`Allegro account with ID ${accountId} not found`);
    }

    await this.prisma.allegroAccount.delete({
      where: { id: accountId },
    });

    // If deleted account was active, clear active account from preferences
    if (account.isActive) {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
      });

      if (settings) {
        const preferences = (settings.preferences || {}) as any;
        if (preferences.activeAllegroAccountId === accountId) {
          delete preferences.activeAllegroAccountId;
          await this.prisma.userSettings.update({
            where: { userId },
            data: { preferences },
          });
        }
      }
    }

    this.logger.log('Allegro account deleted', { userId, accountId });
  }

  /**
   * Set active Allegro account
   */
  async setActiveAccount(userId: string, accountId: string): Promise<void> {
    this.logger.log('Setting active Allegro account', { userId, accountId });

    // Verify account exists and belongs to user
    const account = await this.prisma.allegroAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      throw new NotFoundException(`Allegro account with ID ${accountId} not found`);
    }

    // Use a transaction with timeout to ensure atomicity
    await this.prisma.$transaction(
      async (tx) => {
        // Set all accounts to inactive, then set selected account as active
        // Using Promise.all for parallel execution
        await Promise.all([
          tx.allegroAccount.updateMany({
            where: { userId, id: { not: accountId } },
            data: { isActive: false },
          }),
          tx.allegroAccount.update({
            where: { id: accountId },
            data: { isActive: true },
          }),
        ]);

        // Update preferences
        const existingSettings = await tx.userSettings.findUnique({
          where: { userId },
        });

        if (existingSettings) {
          const preferences = (existingSettings.preferences || {}) as any;
          preferences.activeAllegroAccountId = accountId;
          await tx.userSettings.update({
            where: { userId },
            data: { preferences },
          });
        } else {
          await tx.userSettings.create({
            data: {
              userId,
              preferences: { activeAllegroAccountId: accountId },
              supplierConfigs: [],
            },
          });
        }
      },
      {
        timeout: 10000, // 10 second timeout for transaction
      },
    );

    this.logger.log('Active Allegro account set', { userId, accountId });
  }

  /**
   * Deactivate all accounts (set no active account)
   */
  async deactivateAllAccounts(userId: string): Promise<void> {
    this.logger.log('Deactivating all Allegro accounts', { userId });

    // Set all accounts to inactive
    await this.prisma.allegroAccount.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    // Update preferences to remove active account
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (settings) {
      const preferences = (settings.preferences || {}) as any;
      preferences.activeAllegroAccountId = null;
      await this.prisma.userSettings.update({
        where: { userId },
        data: { preferences },
      });
    } else {
      await this.prisma.userSettings.create({
        data: {
          userId,
          preferences: { activeAllegroAccountId: null },
          supplierConfigs: [],
        },
      });
    }

    this.logger.log('All Allegro accounts deactivated', { userId });
  }

  /**
   * Get active Allegro account
   */
  async getActiveAccount(userId: string): Promise<any | null> {
    this.logger.log('Getting active Allegro account', { userId });

    const account = await this.prisma.allegroAccount.findFirst({
      where: {
        userId,
        isActive: true,
      },
    });

    if (!account) {
      return null;
    }

    const accountData: any = {
      id: account.id,
      name: account.name,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    // Decrypt client secret if present
    if (account.clientSecret) {
      try {
        accountData.clientId = account.clientId;
        accountData.clientSecret = this.decrypt(account.clientSecret);
      } catch (error: any) {
        this.logger.error('Failed to decrypt account client secret', {
          userId,
          accountId: account.id,
          error: error.message,
        });
        accountData.clientId = account.clientId;
        accountData.clientSecret = null;
      }
    } else {
      accountData.clientId = account.clientId;
    }

    // Add OAuth status
    if (account.accessToken) {
      accountData.oauthStatus = {
        authorized: true,
        expiresAt: account.tokenExpiresAt ? (account.tokenExpiresAt instanceof Date ? account.tokenExpiresAt.toISOString() : account.tokenExpiresAt) : undefined,
        scopes: account.tokenScopes || undefined,
      };
    } else {
      accountData.oauthStatus = {
        authorized: false,
      };
    }

    return accountData;
  }

  /**
   * Validate Allegro API keys for specific account
   */
  async validateAllegroAccountKeys(userId: string, accountId: string, dto: ValidateAllegroAccountKeysDto): Promise<{ valid: boolean; message?: string }> {
    // Always use real ALLEGRO_AUTH_URL for both environments
    const tokenUrl = this.configService.get<string>('ALLEGRO_AUTH_URL');
    if (!tokenUrl) {
      this.logger.error('ALLEGRO_AUTH_URL not configured', { userId, accountId });
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'ALLEGRO_AUTH_URL must be configured in .env file',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log('Validating Allegro API keys for account', {
      userId,
      accountId,
      tokenUrl,
      clientId: dto.clientId.substring(0, 8) + '...',
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
              // Use reasonable timeout for Allegro API validation (external API call)
              // Default to 15 seconds - Allegro API should respond quickly
              const allegroTimeout = this.configService.get<string>('ALLEGRO_VALIDATION_TIMEOUT');
              if (allegroTimeout) {
                return parseInt(allegroTimeout);
              }
              const defaultAllegroTimeout = 15000; // 15 seconds - reasonable for API validation
              const authTimeout = this.configService.get<string>('AUTH_SERVICE_TIMEOUT');
              const httpTimeout = this.configService.get<string>('HTTP_TIMEOUT');
              const timeout = authTimeout || httpTimeout;
              if (!timeout) {
                this.logger.log('No timeout configured, using default 15s for Allegro validation', { userId, accountId });
                return defaultAllegroTimeout;
              }
              const configuredTimeout = parseInt(timeout);
              // Use the smaller of configured timeout or 15s for validation (should be quick)
              return Math.min(configuredTimeout, defaultAllegroTimeout);
            })(),
          },
        ),
      );

      if (response.data && response.data.access_token) {
        this.logger.log('Allegro API keys validated successfully', { userId, accountId });
        return { valid: true, message: 'Validated successfully' };
      }

      return { valid: false, message: 'Invalid response from Allegro API' };
    } catch (error: any) {
      const status = error.response?.status;
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error || error.message;
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');

      this.logger.error('Failed to validate Allegro API keys', {
        userId,
        accountId,
        error: errorMessage,
        status,
        code: error.code,
        isTimeout,
      });

      // Handle timeout errors specifically
      if (isTimeout) {
        return { 
          valid: false, 
          message: 'Validation request timed out. Please check your internet connection and try again. If the problem persists, the Allegro API may be temporarily unavailable.' 
        };
      }

      // Handle connection errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        return { 
          valid: false, 
          message: `Cannot connect to Allegro API. Please check your internet connection and verify ALLEGRO_AUTH_URL is correct.` 
        };
      }

      if (status === 401 || status === 403) {
        const specificMessage = errorData.error_description || errorData.error;
        if (specificMessage && specificMessage !== 'invalid_client') {
          return { valid: false, message: `Invalid API credentials: ${specificMessage}` };
        }
        return { valid: false, message: 'Invalid API credentials. Please check your Client ID and Client Secret.' };
      }

      if (status === 404) {
        return { valid: false, message: `OAuth endpoint not found. Please check ALLEGRO_AUTH_URL configuration.` };
      }

      const detailedMessage = errorMessage
        ? `Validation failed: ${errorMessage}${status ? ` (HTTP ${status})` : ''}`
        : `Validation failed: ${error.message || 'Unknown error'}`;

      return { valid: false, message: detailedMessage };
    }
  }
}
