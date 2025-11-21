/**
 * Sync Service
 * Handles bidirectional synchronization between database and Allegro
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { DbToAllegroStrategy } from './strategies/db-to-allegro.strategy';
import { AllegroToDbStrategy } from './strategies/allegro-to-db.strategy';
import { BidirectionalStrategy } from './strategies/bidirectional.strategy';
import { ConflictResolverService } from './conflict/conflict-resolver.service';

@Injectable()
export class SyncService {
  private readonly allegroServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly dbToAllegroStrategy: DbToAllegroStrategy,
    private readonly allegroToDbStrategy: AllegroToDbStrategy,
    private readonly bidirectionalStrategy: BidirectionalStrategy,
    private readonly conflictResolver: ConflictResolverService,
  ) {
    this.allegroServiceUrl = this.configService.get<string>('ALLEGRO_SERVICE_URL');
    if (!this.allegroServiceUrl) {
      throw new Error('Missing required environment variable: ALLEGRO_SERVICE_URL. Please set it in your .env file.');
    }
  }

  /**
   * Sync database to Allegro
   */
  async syncDbToAllegro() {
    this.logger.log('Starting DB to Allegro sync');

    // Create sync job
    const syncJob = await this.prisma.syncJob.create({
      data: {
        type: 'DB_TO_ALLEGRO',
        direction: 'TO_ALLEGRO',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      const batchSize = parseInt(this.configService.get<string>('SYNC_BATCH_SIZE') || '100');
      const result = await this.dbToAllegroStrategy.execute(batchSize);

      // Update sync job
      await this.prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalItems: result.processed,
          processedItems: result.processed,
          successfulItems: result.successful,
          failedItems: result.failed,
          errors: result.errors,
        },
      });

      this.logger.log('DB to Allegro sync completed', result);
      return result;
    } catch (error: any) {
      await this.prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Sync Allegro to database
   */
  async syncAllegroToDb() {
    this.logger.log('Starting Allegro to DB sync');

    // Create sync job
    const syncJob = await this.prisma.syncJob.create({
      data: {
        type: 'ALLEGRO_TO_DB',
        direction: 'FROM_ALLEGRO',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      const result = await this.allegroToDbStrategy.execute();

      await this.prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalItems: result.processed,
          processedItems: result.processed,
          successfulItems: result.successful,
          failedItems: result.failed,
          errors: result.errors,
        },
      });

      return result;
    } catch (error: any) {
      await this.prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Bidirectional sync
   */
  async bidirectionalSync() {
    this.logger.log('Starting bidirectional sync');

    // Create sync job
    const syncJob = await this.prisma.syncJob.create({
      data: {
        type: 'INVENTORY',
        direction: 'BIDIRECTIONAL',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      const batchSize = parseInt(this.configService.get<string>('SYNC_BATCH_SIZE') || '100');
      const result = await this.bidirectionalStrategy.execute(batchSize);

      await this.prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalItems: result.total.processed,
          processedItems: result.total.processed,
          successfulItems: result.total.successful,
          failedItems: result.total.failed,
        },
      });

      return result;
    } catch (error: any) {
      await this.prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Sync specific product
   */
  async syncProduct(productId: string) {
    this.logger.log('Syncing specific product', { productId });

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        allegroOffers: true,
      },
    });

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    const existingOffer = product.allegroOffers[0];
    const batchSize = 1;

    if (existingOffer) {
      // Use update strategy
      const result = await this.dbToAllegroStrategy.execute(batchSize);
      return result;
    } else {
      // Create new offer
      const result = await this.dbToAllegroStrategy.execute(batchSize);
      return result;
    }
  }

  /**
   * Get sync job by ID
   */
  async getSyncJob(id: string) {
    return this.prisma.syncJob.findUnique({
      where: { id },
      include: {
        offer: true,
      },
    });
  }

  /**
   * Get sync jobs
   */
  async getSyncJobs(query: any) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.syncJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.syncJob.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

