/**
 * Sync Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, LoggerModule } from '@allegro/shared';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { DbToAllegroStrategy } from './strategies/db-to-allegro.strategy';
import { AllegroToDbStrategy } from './strategies/allegro-to-db.strategy';
import { BidirectionalStrategy } from './strategies/bidirectional.strategy';
import { ConflictResolverService } from './conflict/conflict-resolver.service';

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule, LoggerModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    DbToAllegroStrategy,
    AllegroToDbStrategy,
    BidirectionalStrategy,
    ConflictResolverService,
  ],
})
export class SyncModule {}

