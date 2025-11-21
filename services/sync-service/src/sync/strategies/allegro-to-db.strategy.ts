/**
 * Allegro to DB Sync Strategy
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AllegroToDbStrategy {
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
   * Execute Allegro to DB sync
   */
  async execute() {
    this.logger.log('Executing Allegro to DB sync strategy');

    try {
      // Fetch offers from Allegro service
      const response = await firstValueFrom(
        this.httpService.get(`${this.allegroServiceUrl}/allegro/offers`),
      );

      const offers = response.data.data?.items || [];
      const results = {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [] as any[],
      };

      for (const offer of offers) {
        try {
          await this.prisma.allegroOffer.upsert({
            where: { allegroOfferId: offer.allegroOfferId },
            update: {
              title: offer.title,
              price: offer.price,
              quantity: offer.quantity,
              stockQuantity: offer.stockQuantity,
              status: offer.status,
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
            create: {
              allegroOfferId: offer.allegroOfferId,
              title: offer.title,
              price: offer.price,
              quantity: offer.quantity,
              stockQuantity: offer.stockQuantity,
              status: offer.status,
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date(),
            },
          });

          results.successful++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            offerId: offer.allegroOfferId,
            error: error.message,
          });
        }

        results.processed++;
      }

      return results;
    } catch (error: any) {
      this.logger.error('Failed to sync from Allegro', {
        error: error.message,
      });
      throw error;
    }
  }
}

