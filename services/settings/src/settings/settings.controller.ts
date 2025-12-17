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
import { UpdateSettingsDto, AddSupplierConfigDto, UpdateSupplierConfigDto, ValidateAllegroKeysDto, CreateAllegroAccountDto, UpdateAllegroAccountDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getSettings(@Request() req: any): Promise<{ success: boolean; data: any }> {
    const controllerStartTime = Date.now();
    const timestamp = new Date().toISOString();
    // Use console.log for immediate visibility in Docker logs
    console.log(`[${timestamp}] [TIMING] SettingsController.getSettings START - Request received at controller`);
    this.logger.log(`[${timestamp}] [TIMING] SettingsController.getSettings START - Request received at controller`);
    
    const userId = String(req.user?.id || req.user?.sub || 'unknown');
    console.log(`[${timestamp}] [TIMING] SettingsController.getSettings - userId extracted: ${userId}`);
    
    const serviceStartTime = Date.now();
    const settings = await this.settingsService.getSettings(userId);
    const serviceDuration = Date.now() - serviceStartTime;
    
    const totalDuration = Date.now() - controllerStartTime;
    console.log(`[${new Date().toISOString()}] [TIMING] SettingsController.getSettings COMPLETE (${totalDuration}ms total, service: ${serviceDuration}ms)`);
    this.logger.log(`[${new Date().toISOString()}] [TIMING] SettingsController.getSettings COMPLETE (${totalDuration}ms total, service: ${serviceDuration}ms)`, {
      userId,
      totalDurationMs: totalDuration,
      serviceDurationMs: serviceDuration,
    });
    
    return { success: true, data: settings };
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  async updateSettings(
    @Request() req: any,
    @Body() dto: UpdateSettingsDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id); // Convert to string as Prisma expects String
    
    const settings = await this.settingsService.updateSettings(userId, dto);
    
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

  @Get('allegro-accounts')
  @UseGuards(JwtAuthGuard)
  async getAllegroAccounts(@Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id);
    const accounts = await this.settingsService.getAllegroAccounts(userId);
    return { success: true, data: accounts };
  }

  @Get('allegro-accounts/:id')
  @UseGuards(JwtAuthGuard)
  async getAllegroAccount(
    @Request() req: any,
    @Param('id') accountId: string,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id);
    const account = await this.settingsService.getAllegroAccount(userId, accountId);
    return { success: true, data: account };
  }

  @Post('allegro-accounts')
  @UseGuards(JwtAuthGuard)
  async createAllegroAccount(
    @Request() req: any,
    @Body() dto: CreateAllegroAccountDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id);
    const account = await this.settingsService.createAllegroAccount(userId, dto);
    return { success: true, data: account };
  }

  @Put('allegro-accounts/:id')
  @UseGuards(JwtAuthGuard)
  async updateAllegroAccount(
    @Request() req: any,
    @Param('id') accountId: string,
    @Body() dto: UpdateAllegroAccountDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id);
    const account = await this.settingsService.updateAllegroAccount(userId, accountId, dto);
    return { success: true, data: account };
  }

  @Delete('allegro-accounts/:id')
  @UseGuards(JwtAuthGuard)
  async deleteAllegroAccount(
    @Request() req: any,
    @Param('id') accountId: string,
  ): Promise<{ success: boolean }> {
    const userId = String(req.user.id);
    await this.settingsService.deleteAllegroAccount(userId, accountId);
    return { success: true };
  }

  @Post('allegro-accounts/:id/activate')
  @UseGuards(JwtAuthGuard)
  async activateAllegroAccount(
    @Request() req: any,
    @Param('id') accountId: string,
  ): Promise<{ success: boolean }> {
    const userId = String(req.user.id);
    await this.settingsService.setActiveAccount(userId, accountId);
    return { success: true };
  }

  @Post('allegro-accounts/:id/validate')
  @UseGuards(JwtAuthGuard)
  async validateAllegroAccountKeys(
    @Request() req: any,
    @Param('id') accountId: string,
    @Body() dto: ValidateAllegroKeysDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id);
    try {
      const result = await this.settingsService.validateAllegroAccountKeys(userId, accountId, dto);
      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error('SettingsController.validateAllegroAccountKeys error', {
        userId,
        accountId,
        error: error.message,
        errorStack: error.stack,
      });
      // Re-throw to let global exception filter handle it
      throw error;
    }
  }
}
