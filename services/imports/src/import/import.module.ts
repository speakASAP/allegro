/**
 * Import Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, LoggerModule, AuthModule } from '@allegro/shared';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { CsvParserService } from './csv/csv-parser.service';
import { BizboxParserService } from './csv/bizbox-parser.service';
import { BizboxToAllegroService } from './transformer/bizbox-to-allegro.service';
import { FieldMapperService } from './transformer/field-mapper.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, LoggerModule, AuthModule],
  controllers: [ImportController],
  providers: [
    ImportService,
    CsvParserService,
    BizboxParserService,
    BizboxToAllegroService,
    FieldMapperService,
  ],
})
export class ImportModule {}

