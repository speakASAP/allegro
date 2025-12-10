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
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { OffersService } from './offers.service';
import { JwtAuthGuard, LoggerService } from '@allegro/shared';
import { CreateOfferDto } from '../dto/create-offer.dto';
import { UpdateOfferDto } from '../dto/update-offer.dto';
import { OfferQueryDto } from '../dto/offer-query.dto';

@Controller('allegro/offers')
export class OffersController {
  private readonly logger: LoggerService;

  constructor(
    private readonly offersService: OffersService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService;
    this.logger.setContext('OffersController');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getOffers(@Query() query: OfferQueryDto): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.getOffers(query);
    return { success: true, data: result };
  }

  @Get('import/preview')
  @UseGuards(JwtAuthGuard)
  async previewOffers(@Request() req: any): Promise<{ success: boolean; data: any }> {
    try {
      const userId = String(req.user.id);
      const result = await this.offersService.previewOffersFromAllegro(userId);
      return { success: true, data: result };
    } catch (error: any) {
      const errorStatus = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error || errorData.message || error.message || 'Failed to preview offers from Allegro API';
      
      this.logger.error('Failed to preview offers', {
        error: error.message,
        status: errorStatus,
        userId: req.user?.id,
        allegroError: errorData,
        responseData: error.response?.data,
      });
      
      // Provide more helpful error messages based on status code
      let userFriendlyMessage = errorMessage;
      if (errorStatus === 403) {
        // Allegro API requires OAuth authorization code flow for accessing user's offers
        // client_credentials grant only works for public endpoints
        const allegroError = errorData.errors?.[0];
        if (allegroError?.code === 'AccessDenied') {
          userFriendlyMessage = 'Access denied: To import offers from Allegro, you need to authorize the application using OAuth. The current API credentials (client_credentials) only provide access to public endpoints, not your personal offers. Please use OAuth authorization code flow to grant access to your Allegro account.';
        } else {
          userFriendlyMessage = 'Access denied by Allegro API. Your API credentials may not have the required permissions (scopes) to access offers. To access your offers, you need to authorize the application via OAuth authorization code flow, not just client credentials.';
        }
      } else if (errorStatus === 401) {
        userFriendlyMessage = 'Authentication failed with Allegro API. Please check your API credentials in Settings.';
      }
      
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'PREVIEW_ERROR',
            message: userFriendlyMessage,
            status: errorStatus,
            details: errorData,
          },
        },
        errorStatus,
      );
    }
  }

  @Post('import/approve')
  @UseGuards(JwtAuthGuard)
  async importApprovedOffers(@Body() body: { offerIds: string[] }): Promise<{ success: boolean; data: any }> {
    const result = await this.offersService.importApprovedOffers(body.offerIds);
    return { success: true, data: result };
  }

  @Get('import')
  @UseGuards(JwtAuthGuard)
  async importOffers(@Request() req: any): Promise<{ success: boolean; data: any }> {
    try {
      const userId = String(req.user.id);
      const result = await this.offersService.importAllOffers(userId);
      return { success: true, data: result };
    } catch (error: any) {
      const errorStatus = error.response?.status || 500;
      const errorMessage = error.message || 'Failed to import offers from Allegro';
      
      this.logger.error('Failed to import offers', {
        error: error.message,
        status: errorStatus,
        userId: req.user?.id,
      });
      
      // Provide helpful error message for OAuth-related errors
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('OAuth authorization required')) {
        userFriendlyMessage = errorMessage;
      } else if (errorStatus === 403 || errorStatus === 401) {
        userFriendlyMessage = 'OAuth authorization required. The Allegro API requires OAuth authorization to access your offers. Please go to Settings and click "Authorize with Allegro" to grant access to your Allegro account.';
      }
      
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'IMPORT_ERROR',
            message: userFriendlyMessage,
            status: errorStatus,
            requiresOAuth: errorMessage.includes('OAuth authorization required') || errorStatus === 403 || errorStatus === 401,
            oauthSettingsUrl: '/dashboard/settings',
          },
        },
        errorStatus,
      );
    }
  }

  @Get('import/sales-center/preview')
  @UseGuards(JwtAuthGuard)
  async previewOffersFromSalesCenter(@Request() req: any): Promise<{ success: boolean; data: any }> {
    try {
      this.logger.log('Previewing offers from Allegro Sales Center');
      const result = await this.offersService.previewOffersFromSalesCenter();
      return { success: true, data: result };
    } catch (error: any) {
      const errorStatus = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error || errorData.message || error.message || 'Failed to preview offers from Allegro Sales Center';

      this.logger.error('Failed to preview offers from Sales Center', {
        error: error.message,
        status: errorStatus,
        userId: req.user?.id,
        allegroError: errorData,
        responseData: error.response?.data,
      });

      // Provide more helpful error messages based on status code
      let userFriendlyMessage = errorMessage;
      if (errorStatus === 403) {
        // Allegro API requires OAuth authorization code flow for accessing user's offers
        // client_credentials grant only works for public endpoints
        const allegroError = errorData.errors?.[0];
        if (allegroError?.code === 'AccessDenied') {
          userFriendlyMessage = 'Access denied: To import offers from Allegro Sales Center, you need to authorize the application using OAuth. The current API credentials (client_credentials) only provide access to public endpoints, not your personal offers. Please use OAuth authorization code flow to grant access to your Allegro account.';
        } else {
          userFriendlyMessage = 'Access denied by Allegro API. Your API credentials may not have the required permissions (scopes) to access offers. To access your offers, you need to authorize the application via OAuth authorization code flow, not just client credentials.';
        }
      } else if (errorStatus === 401) {
        userFriendlyMessage = 'Authentication failed with Allegro API. Please check your API credentials in Settings.';
      }

      throw new HttpException(
        {
          success: false,
          error: {
            code: 'PREVIEW_ERROR',
            message: userFriendlyMessage,
            status: errorStatus,
            details: errorData,
          },
        },
        errorStatus,
      );
    }
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

