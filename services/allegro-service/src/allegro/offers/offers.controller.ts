/**
 * Offers Controller
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { OffersService } from './offers.service';
import { JwtAuthGuard } from '@allegro/shared';
import { CreateOfferDto } from '../dto/create-offer.dto';
import { UpdateOfferDto } from '../dto/update-offer.dto';
import { OfferQueryDto } from '../dto/offer-query.dto';

@Controller('allegro/offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getOffers(@Query() query: OfferQueryDto): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.getOffers(query);
    return { success: true, data: result };
  }

  @Get('import/preview')
  @UseGuards(JwtAuthGuard)
  async previewOffers(): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.previewOffersFromAllegro();
    return { success: true, data: result };
  }

  @Post('import/approve')
  @UseGuards(JwtAuthGuard)
  async importApprovedOffers(@Body() body: { offerIds: string[] }): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.importApprovedOffers(body.offerIds);
    return { success: true, data: result };
  }

  @Get('import')
  @UseGuards(JwtAuthGuard)
  async importOffers(): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.importAllOffers();
    return { success: true, data: result };
  }

  @Get('import/sales-center/preview')
  @UseGuards(JwtAuthGuard)
  async previewOffersFromSalesCenter(): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.previewOffersFromSalesCenter();
    return { success: true, data: result };
  }

  @Post('import/sales-center/approve')
  @UseGuards(JwtAuthGuard)
  async importApprovedOffersFromSalesCenter(@Body() body: { offerIds: string[] }): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.importApprovedOffersFromSalesCenter(body.offerIds);
    return { success: true, data: result };
  }

  @Post('import/sales-center')
  @UseGuards(JwtAuthGuard)
  async importFromSalesCenter(): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.importFromSalesCenter();
    return { success: true, data: result };
  }

  @Get('export/csv')
  @UseGuards(JwtAuthGuard)
  async exportToCsv(@Res() res: Response) {
    const csv = await this.offersService.exportToCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=offers_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOffer(@Param('id') id: string): Promise<{ success: boolean; data: any }> {
    const offer = await this.offersService.getOffer(id);
    return { success: true, data: offer };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createOffer(@Body() dto: CreateOfferDto): Promise<{ success: boolean; data: any }> {
    const offer = await this.offersService.createOffer(dto);
    return { success: true, data: offer };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateOffer(@Param('id') id: string, @Body() dto: UpdateOfferDto): Promise<{ success: boolean; data: any }> {
    const offer = await this.offersService.updateOffer(id, dto);
    return { success: true, data: offer };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteOffer(@Param('id') id: string): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.deleteOffer(id);
    return { success: true, data: result };
  }

  @Put(':id/stock')
  @UseGuards(JwtAuthGuard)
  async updateStock(@Param('id') id: string, @Body() body: { quantity: number }): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.updateStock(id, body.quantity);
    return { success: true, data: result };
  }
}

