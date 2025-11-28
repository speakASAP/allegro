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
import { UpdateSettingsDto, AddSupplierConfigDto, UpdateSupplierConfigDto, ValidateAllegroKeysDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getSettings(@Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = req.user.id;
    const settings = await this.settingsService.getSettings(userId);
    return { success: true, data: settings };
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  async updateSettings(
    @Request() req: any,
    @Body() dto: UpdateSettingsDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = req.user.id;
    const settings = await this.settingsService.updateSettings(userId, dto);
    return { success: true, data: settings };
  }

  @Post('suppliers')
  @UseGuards(JwtAuthGuard)
  async addSupplierConfig(
    @Request() req: any,
    @Body() dto: AddSupplierConfigDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = req.user.id;
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
    const userId = req.user.id;
    const config = await this.settingsService.updateSupplierConfig(userId, supplierId, dto);
    return { success: true, data: config };
  }

  @Delete('suppliers/:id')
  @UseGuards(JwtAuthGuard)
  async removeSupplierConfig(
    @Request() req: any,
    @Param('id') supplierId: string,
  ): Promise<{ success: boolean }> {
    const userId = req.user.id;
    await this.settingsService.removeSupplierConfig(userId, supplierId);
    return { success: true };
  }

  @Post('validate/allegro')
  @UseGuards(JwtAuthGuard)
  async validateAllegroKeys(
    @Request() req: any,
    @Body() dto: ValidateAllegroKeysDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = req.user.id;
    const result = await this.settingsService.validateAllegroKeys(userId, dto);
    return { success: true, data: result };
  }
}
