/**
 * Conflict Resolver Service
 * Handles conflicts when both DB and Allegro have changes
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '@allegro/shared';
import { ConfigService } from '@nestjs/config';

export type ConflictStrategy = 'TIMESTAMP' | 'DB_WINS' | 'ALLEGRO_WINS' | 'MANUAL';

@Injectable()
export class ConflictResolverService {
  private readonly strategy: ConflictStrategy;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.strategy = (this.configService.get<string>('SYNC_CONFLICT_STRATEGY') || 'TIMESTAMP') as ConflictStrategy;
  }

  /**
   * Resolve conflict between DB and Allegro data
   */
  resolveConflict(
    dbData: any,
    allegroData: any,
    dbUpdatedAt: Date,
    allegroUpdatedAt: Date,
  ): 'USE_DB' | 'USE_ALLEGRO' | 'MANUAL_REVIEW' {
    switch (this.strategy) {
      case 'TIMESTAMP':
        return this.resolveByTimestamp(dbUpdatedAt, allegroUpdatedAt);
      
      case 'DB_WINS':
        return 'USE_DB';
      
      case 'ALLEGRO_WINS':
        return 'USE_ALLEGRO';
      
      case 'MANUAL':
        return 'MANUAL_REVIEW';
      
      default:
        return this.resolveByTimestamp(dbUpdatedAt, allegroUpdatedAt);
    }
  }

  /**
   * Resolve conflict by timestamp (newer wins)
   */
  private resolveByTimestamp(dbUpdatedAt: Date, allegroUpdatedAt: Date): 'USE_DB' | 'USE_ALLEGRO' {
    if (dbUpdatedAt > allegroUpdatedAt) {
      this.logger.debug('Conflict resolved: DB is newer', {
        dbUpdatedAt,
        allegroUpdatedAt,
      });
      return 'USE_DB';
    } else {
      this.logger.debug('Conflict resolved: Allegro is newer', {
        dbUpdatedAt,
        allegroUpdatedAt,
      });
      return 'USE_ALLEGRO';
    }
  }

  /**
   * Resolve conflict by field (different rules per field)
   */
  resolveFieldConflict(
    field: string,
    dbValue: any,
    allegroValue: any,
  ): any {
    // Field-specific rules
    const fieldRules: Record<string, 'DB_WINS' | 'ALLEGRO_WINS'> = {
      price: 'ALLEGRO_WINS', // Price from Allegro wins
      description: 'DB_WINS', // Description from DB wins
      stockQuantity: 'ALLEGRO_WINS', // Stock from Allegro wins
    };

    const rule = fieldRules[field] || 'DB_WINS';
    
    if (rule === 'ALLEGRO_WINS') {
      return allegroValue;
    } else {
      return dbValue;
    }
  }
}

