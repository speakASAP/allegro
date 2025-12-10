/**
 * Settings Controller
 * Handles HTTP requests for settings operations
 */

import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '@allegro/shared';
import { LoggerService } from '@allegro/shared';
import { UpdateSettingsDto, AddSupplierConfigDto, UpdateSupplierConfigDto, ValidateAllegroKeysDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getSettings(@Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id); // Convert to string as Prisma expects String
    const settings = await this.settingsService.getSettings(userId);
    return { success: true, data: settings };
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  async updateSettings(
    @Request() req: any,
    @Body() dto: UpdateSettingsDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id); // Convert to string as Prisma expects String
    
    const logData = {
      userId,
      hasClientId: !!dto.allegroClientId,
      clientIdLength: dto.allegroClientId?.length,
      hasClientSecret: !!dto.allegroClientSecret,
      clientSecretLength: dto.allegroClientSecret?.length,
      clientSecretFirstChars: dto.allegroClientSecret?.substring(0, 5) + '...',
      dtoKeys: Object.keys(dto),
    };
    this.logger.log('SettingsController.updateSettings called', logData);
    console.log('[SettingsController] updateSettings called', JSON.stringify(logData, null, 2));
    
    const settings = await this.settingsService.updateSettings(userId, dto);
    
    const completedLogData = {
      userId,
      resultSuccess: settings?.success !== false,
      hasResultData: !!settings,
      resultKeys: settings ? Object.keys(settings) : [],
      hasClientId: !!settings?.allegroClientId,
      hasClientSecret: !!settings?.allegroClientSecret,
      clientSecretLength: settings?.allegroClientSecret?.length,
      hasDecryptionError: !!settings?._allegroClientSecretDecryptionError,
    };
    this.logger.log('SettingsController.updateSettings completed', completedLogData);
    console.log('[SettingsController] updateSettings completed', JSON.stringify(completedLogData, null, 2));
    
    return { success: true, data: settings };
  }

  @Post('suppliers')
  @UseGuards(JwtAuthGuard)
  async addSupplierConfig(
    @Request() req: any,
    @Body() dto: AddSupplierConfigDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id); // Convert to string as Prisma expects String
    const config = await this.settingsService.addSupplierConfig(userId, dto);
    return { success: true, data: config };
  }

  @Put('suppliers/:id')
  @UseGuards(JwtAuthGuard)
  async updateSupplierConfig(
    @Request() req: any,
    @Param('id') supplierId: string,
    @Body() dto: UpdateSupplierConfigDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id); // Convert to string as Prisma expects String
    const config = await this.settingsService.updateSupplierConfig(userId, supplierId, dto);
    return { success: true, data: config };
  }

  @Delete('suppliers/:id')
  @UseGuards(JwtAuthGuard)
  async removeSupplierConfig(
    @Request() req: any,
    @Param('id') supplierId: string,
  ): Promise<{ success: boolean }> {
    const userId = String(req.user.id); // Convert to string as Prisma expects String
    await this.settingsService.removeSupplierConfig(userId, supplierId);
    return { success: true };
  }

  @Post('validate/allegro')
  @UseGuards(JwtAuthGuard)
  async validateAllegroKeys(
    @Request() req: any,
    @Body() dto: ValidateAllegroKeysDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id); // Convert to string as Prisma expects String
    const result = await this.settingsService.validateAllegroKeys(userId, dto);
    return { success: true, data: result };
  }
}
