import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../shared';
import { AllegroApiService } from '../allegro-api.service';
import { LoggerService } from '../../../../shared/logger/logger.service';
import * as crypto from 'crypto';

/**
 * Service for managing responsible producers
 * Ensures all producers are synced from Allegro API to database before exporting offers
 */
@Injectable()
export class ProducersService {
  private readonly encryptionKey: string;
  private readonly encryptionAlgorithm = 'aes-256-cbc';

  constructor(
    private readonly prisma: PrismaService,
    private readonly allegroApi: AllegroApiService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY') || '';
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be configured and at least 32 characters long');
    }
  }

  /**
   * Sync all producers from Allegro API for an account
   * This should be called before exporting offers to ensure all producers exist in database
   */
  async syncProducersForAccount(accountId: string, userId: string): Promise<{
    total: number;
    synced: number;
    errors: number;
  }> {
    const account = await this.prisma.allegroAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (account.userId !== userId) {
      throw new Error(`Account ${accountId} does not belong to user ${userId}`);
    }

    // Get OAuth token
    const oauthToken = await this.getOAuthToken(account);

    // Fetch producers from Allegro API
    let producersFromAllegro: any[] = [];
    try {
      const response = await this.allegroApi.getResponsibleProducersWithOAuthToken(oauthToken);
      producersFromAllegro = response?.responsibleProducers || [];
      this.logger.log(`[syncProducersForAccount] Fetched ${producersFromAllegro.length} producers from Allegro`, {
        accountId,
        accountName: account.name,
      });
    } catch (error: any) {
      this.logger.error(`[syncProducersForAccount] Failed to fetch producers from Allegro`, {
        accountId,
        error: error.message,
      });
      throw error;
    }

    // Sync each producer to database
    let synced = 0;
    let errors = 0;

    for (const producer of producersFromAllegro) {
      try {
        await this.upsertProducer(accountId, producer);
        synced++;
      } catch (error: any) {
        errors++;
        this.logger.error(`[syncProducersForAccount] Failed to sync producer ${producer.id}`, {
          accountId,
          producerId: producer.id,
          error: error.message,
        });
      }
    }

    this.logger.log(`[syncProducersForAccount] Sync completed`, {
      accountId,
      total: producersFromAllegro.length,
      synced,
      errors,
    });

    return {
      total: producersFromAllegro.length,
      synced,
      errors,
    };
  }

  /**
   * Upsert a producer in the database
   */
  private async upsertProducer(accountId: string, producerData: any): Promise<void> {
    const producerId = String(producerData.id);
    const name = producerData.name || producerData.companyName || null;
    const email = producerData.email || null;
    const phone = producerData.phone || null;
    const address = producerData.address || null;

    await this.prisma.responsibleProducer.upsert({
      where: {
        accountId_producerId: {
          accountId,
          producerId,
        },
      },
      update: {
        name,
        email,
        phone,
        address: address as any,
        rawData: producerData as any,
        lastSyncedAt: new Date(),
        syncStatus: 'SYNCED',
        syncError: null,
      },
      create: {
        accountId,
        producerId,
        name,
        email,
        phone,
        address: address as any,
        rawData: producerData as any,
        lastSyncedAt: new Date(),
        syncStatus: 'SYNCED',
      },
    });
  }

  /**
   * Get producer by Allegro producer ID for an account
   * Returns database ID if found, null otherwise
   */
  async getProducerByAllegroId(accountId: string, allegroProducerId: string): Promise<string | null> {
    const producer = await this.prisma.responsibleProducer.findUnique({
      where: {
        accountId_producerId: {
          accountId,
          producerId: allegroProducerId,
        },
      },
    });

    return producer?.id || null;
  }

  /**
   * Ensure producer exists in database before exporting offer
   * If producer doesn't exist, fetches it from Allegro API and stores it
   */
  async ensureProducerExists(
    accountId: string,
    userId: string,
    allegroProducerId: string,
  ): Promise<string> {
    // Check if producer exists in database
    let producerDbId = await this.getProducerByAllegroId(accountId, allegroProducerId);

    if (producerDbId) {
      return producerDbId;
    }

    // Producer doesn't exist - fetch from Allegro API
    const account = await this.prisma.allegroAccount.findUnique({
      where: { id: accountId },
    });

    if (!account || account.userId !== userId) {
      throw new Error(`Account ${accountId} not found or doesn't belong to user`);
    }

    const oauthToken = await this.getOAuthToken(account);

    try {
      const producerData = await this.allegroApi.getResponsibleProducerByIdWithOAuthToken(
        oauthToken,
        allegroProducerId,
      );

      if (!producerData) {
        throw new Error(`Producer ${allegroProducerId} not found on Allegro`);
      }

      // Store in database
      await this.upsertProducer(accountId, producerData);

      // Get database ID
      producerDbId = await this.getProducerByAllegroId(accountId, allegroProducerId);

      if (!producerDbId) {
        throw new Error(`Failed to retrieve producer ID after upsert`);
      }

      this.logger.log(`[ensureProducerExists] Created producer in database`, {
        accountId,
        allegroProducerId,
        producerDbId,
      });

      return producerDbId;
    } catch (error: any) {
      this.logger.error(`[ensureProducerExists] Failed to fetch and store producer`, {
        accountId,
        allegroProducerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get OAuth token for account (decrypted)
   */
  private async getOAuthToken(account: any): Promise<string> {
    if (!account.accessToken) {
      throw new Error(`Account ${account.id} has no access token`);
    }

    try {
      const decrypted = this.decrypt(account.accessToken);
      return decrypted;
    } catch (error: any) {
      throw new Error(`Failed to decrypt access token for account ${account.id}: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted text format');
      }
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = Buffer.from(parts[1], 'hex');
      const decipher = crypto.createDecipheriv(
        this.encryptionAlgorithm,
        Buffer.from(this.encryptionKey.substring(0, 32), 'utf8'),
        iv,
      );
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error: any) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }
}

