/**
 * Bidirectional Sync Strategy
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '@allegro/shared';
import { AllegroToDbStrategy } from './allegro-to-db.strategy';
import { DbToAllegroStrategy } from './db-to-allegro.strategy';

@Injectable()
export class BidirectionalStrategy {
  constructor(
    private readonly logger: LoggerService,
    private readonly allegroToDbStrategy: AllegroToDbStrategy,
    private readonly dbToAllegroStrategy: DbToAllegroStrategy,
  ) {}

  /**
   * Execute bidirectional sync
   */
  async execute(batchSize: number = 100) {
    this.logger.log('Executing bidirectional sync strategy');

    // First sync from Allegro to DB
    const allegroToDbResult = await this.allegroToDbStrategy.execute();

    // Then sync from DB to Allegro
    const dbToAllegroResult = await this.dbToAllegroStrategy.execute(batchSize);

    return {
      allegroToDb: allegroToDbResult,
      dbToAllegro: dbToAllegroResult,
      total: {
        processed: allegroToDbResult.processed + dbToAllegroResult.processed,
        successful: allegroToDbResult.successful + dbToAllegroResult.successful,
        failed: allegroToDbResult.failed + dbToAllegroResult.failed,
      },
    };
  }
}

