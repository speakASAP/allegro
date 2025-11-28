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
    this.logger.log('Validating Allegro API keys', { userId });

    try {
      const allegroApiUrl = this.configService.get<string>('ALLEGRO_API_URL') || 'https://api.allegro.pl';
      const useSandbox = this.configService.get<string>('ALLEGRO_USE_SANDBOX') === 'true';
      const baseUrl = useSandbox
        ? (this.configService.get<string>('ALLEGRO_API_SANDBOX_URL') || 'https://api.allegro.pl')
        : allegroApiUrl;

      // Try to get OAuth token using the credentials
      const tokenUrl = `${baseUrl}/auth/oauth/token`;
      const credentials = Buffer.from(`${dto.clientId}:${dto.clientSecret}`).toString('base64');

      const response = await firstValueFrom(
        this.httpService.post(
          tokenUrl,
          'grant_type=client_credentials',
          {
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 10000,
          },
        ),
      );

      if (response.data && response.data.access_token) {
        this.logger.log('Allegro API keys validated successfully', { userId });
        // Note: Notification can be sent via email if needed
        // await this.notificationService.sendNotification({
        //   channel: 'email',
        //   type: 'custom',
        //   recipient: userEmail,
        //   subject: 'Allegro API Keys Validated',
        //   message: 'Your Allegro API keys have been successfully validated.',
        // });
        return { valid: true, message: 'API keys are valid' };
      }

      return { valid: false, message: 'Invalid response from Allegro API' };
    } catch (error: any) {
      this.logger.error('Failed to validate Allegro API keys', {
        userId,
        error: error.message,
        status: error.response?.status,
      });

      if (error.response?.status === 401 || error.response?.status === 403) {
        return { valid: false, message: 'Invalid API credentials' };
      }

      return { valid: false, message: `Validation failed: ${error.message}` };
    }
  }
}
