/**
 * DB to Allegro Sync Strategy
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DbToAllegroStrategy {
  private readonly allegroServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.allegroServiceUrl = this.configService.get<string>('ALLEGRO_SERVICE_URL');
    if (!this.allegroServiceUrl) {
      throw new Error('Missing required environment variable: ALLEGRO_SERVICE_URL. Please set it in your .env file.');
    }
  }

  /**
   * Execute DB to Allegro sync
   */
  async execute(batchSize: number = 100) {
    this.logger.log('Executing DB to Allegro sync strategy');

    // Find products that need syncing
    const products = await this.prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { updatedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, // Updated in last 24h
        ],
      },
      include: {
        allegroOffers: true,
      },
      take: batchSize,
    });

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as any[],
    };

    for (const product of products) {
      try {
        // Check if offer exists
        const existingOffer = product.allegroOffers[0];

        if (existingOffer) {
          // Update existing offer
          await firstValueFrom(
            this.httpService.put(
              `${this.allegroServiceUrl}/allegro/offers/${existingOffer.id}`,
              {
                title: product.name,
                description: product.description,
                price: product.sellingPrice || product.purchasePrice,
                quantity: product.stockQuantity,
              },
            ),
          );
        } else {
          // Create new offer
          await firstValueFrom(
            this.httpService.post(
              `${this.allegroServiceUrl}/allegro/offers`,
              {
                productId: product.id,
                title: product.name,
                description: product.description,
                price: product.sellingPrice || product.purchasePrice,
                quantity: product.stockQuantity,
              },
            ),
          );
        }

        results.successful++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          productId: product.id,
          error: error.message,
        });
      }

      results.processed++;
    }

    return results;
  }
}

