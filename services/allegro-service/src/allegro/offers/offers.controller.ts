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
} from '@nestjs/common';
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
  async getOffers(@Query() query: OfferQueryDto) {
    const result = await this.offersService.getOffers(query);
    return { success: true, data: result };
  }

  @Get('import')
  @UseGuards(JwtAuthGuard)
  async importOffers() {
    const result = await this.offersService.importAllOffers();
    return { success: true, data: result };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOffer(@Param('id') id: string) {
    const offer = await this.offersService.getOffer(id);
    return { success: true, data: offer };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createOffer(@Body() dto: CreateOfferDto) {
    const offer = await this.offersService.createOffer(dto);
    return { success: true, data: offer };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateOffer(@Param('id') id: string, @Body() dto: UpdateOfferDto) {
    const offer = await this.offersService.updateOffer(id, dto);
    return { success: true, data: offer };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteOffer(@Param('id') id: string) {
    const result = await this.offersService.deleteOffer(id);
    return { success: true, data: result };
  }

  @Put(':id/stock')
  @UseGuards(JwtAuthGuard)
  async updateStock(@Param('id') id: string, @Body() body: { quantity: number }) {
    const result = await this.offersService.updateStock(id, body.quantity);
    return { success: true, data: result };
  }
}

