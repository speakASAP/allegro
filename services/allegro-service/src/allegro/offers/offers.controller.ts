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
import { JwtAuthGuard, LoggerService, MetricsService } from '@allegro/shared';
import { CreateOfferDto } from '../dto/create-offer.dto';
import { UpdateOfferDto } from '../dto/update-offer.dto';
import { OfferQueryDto } from '../dto/offer-query.dto';

@Controller('allegro/offers')
export class OffersController {
  private readonly logger: LoggerService;

  constructor(
    private readonly offersService: OffersService,
    loggerService: LoggerService,
    private readonly metricsService: MetricsService,
  ) {
    this.logger = loggerService;
    this.logger.setContext('OffersController');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getOffers(@Query() query: OfferQueryDto, @Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user?.id || 'unknown');
    try {
      this.logger.log('Getting offers list', {
        userId,
        filters: {
          status: query.status,
          search: query.search,
          categoryId: query.categoryId,
        },
        pagination: {
          page: query.page || 1,
          limit: query.limit || 20,
        },
      });
      const result = await this.offersService.getOffers(query);
      this.metricsService.incrementListRequests();
      this.logger.log('Offers list retrieved', {
        userId,
        total: result.pagination?.total || 0,
        returned: result.items?.length || 0,
      });
      return { success: true, data: result };
    } catch (error: any) {
      this.metricsService.incrementErrors();
      throw error;
    }
  }

  @Get('import/preview')
  @UseGuards(JwtAuthGuard)
  async previewOffers(@Request() req: any): Promise<{ success: boolean; data: any }> {
    try {
      const userId = String(req.user.id);
      const result = await this.offersService.previewOffersFromAllegro(userId);
      return { success: true, data: result };
    } catch (error: any) {
      this.metricsService.incrementErrors();
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
  async importApprovedOffers(@Request() req: any, @Body() body: { offerIds: string[] }): Promise<{ success: boolean; data: any }> {
    try {
      const userId = String(req.user.id);
      this.logger.log('[importApprovedOffers] Controller received request', {
        userId,
        offerIdsCount: body.offerIds?.length || 0,
        offerIds: body.offerIds?.slice(0, 5), // Log first 5 for debugging
      });

      const result = await this.offersService.importApprovedOffers(userId, body.offerIds);

      this.logger.log('[importApprovedOffers] Controller completed successfully', {
        userId,
        totalImported: result.totalImported,
      });

      return { success: true, data: result };
    } catch (error: any) {
      this.metricsService.incrementErrors();
      const errorStatus = error.response?.status || error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error || errorData.message || error.message || 'Failed to import approved offers';

      this.logger.error('[importApprovedOffers] Controller error', {
        error: error.message,
        status: errorStatus,
        userId: req.user?.id,
        errorData: JSON.stringify(errorData, null, 2),
        errorStack: error.stack,
      });

      // Check if error is OAuth-related
      const isOAuthError = errorMessage.toLowerCase().includes('oauth') ||
                          errorMessage.toLowerCase().includes('authorization required') ||
                          errorStatus === 403 ||
                          errorStatus === 401 ||
                          error.code === 'OAUTH_REQUIRED';

      let userFriendlyMessage = errorMessage;
      if (isOAuthError) {
        userFriendlyMessage = 'OAuth authorization required or token expired. Please go to Settings and re-authorize the application to access your Allegro offers.';
      }

      throw new HttpException(
        {
          success: false,
          error: {
            code: isOAuthError ? 'OAUTH_REQUIRED' : 'IMPORT_ERROR',
            message: userFriendlyMessage,
            status: errorStatus,
            requiresOAuth: isOAuthError,
            oauthSettingsUrl: '/dashboard/settings',
            details: errorData,
          },
        },
        errorStatus,
      );
    }
  }

  @Get('import')
  @UseGuards(JwtAuthGuard)
  async importOffers(@Request() req: any): Promise<{ success: boolean; data: any }> {
    try {
      const userId = String(req.user.id);
      const result = await this.offersService.importAllOffers(userId);
      return { success: true, data: result };
    } catch (error: any) {
      this.metricsService.incrementErrors();
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
      const userId = String(req.user.id);
      const result = await this.offersService.previewOffersFromSalesCenter(userId);
      return { success: true, data: result };
    } catch (error: any) {
      this.metricsService.incrementErrors();
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
      const requiresOAuth =
        errorStatus === HttpStatus.FORBIDDEN ||
        errorStatus === HttpStatus.UNAUTHORIZED ||
        errorMessage.toLowerCase().includes('oauth authorization required');
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
            requiresOAuth,
          },
        },
        errorStatus,
      );
    }
  }

  @Post('import/sales-center/approve')
  @UseGuards(JwtAuthGuard)
  async importApprovedOffersFromSalesCenter(
    @Request() req: any,
    @Body() body: { offerIds: string[] },
  ): Promise<{ success: boolean; data: any }> {
    try {
      const userId = String(req.user.id);
      this.logger.log('[importApprovedOffersFromSalesCenter] Controller received request', {
        userId,
        offerIdsCount: body.offerIds?.length || 0,
        offerIds: body.offerIds?.slice(0, 5), // Log first 5 for debugging
      });

      const result = await this.offersService.importApprovedOffersFromSalesCenter(
        userId,
        body.offerIds,
      );

      this.logger.log('[importApprovedOffersFromSalesCenter] Controller completed successfully', {
        userId,
        totalImported: result.totalImported,
      });

      return { success: true, data: result };
    } catch (error: any) {
      this.metricsService.incrementErrors();
      const errorStatus = error.response?.status || error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error || errorData.message || error.message || 'Failed to import approved offers from Sales Center';

      this.logger.error('[importApprovedOffersFromSalesCenter] Controller error', {
        error: error.message,
        status: errorStatus,
        userId: req.user?.id,
        errorData: JSON.stringify(errorData, null, 2),
        errorStack: error.stack,
      });

      // Check if error is OAuth-related
      const isOAuthError = errorMessage.toLowerCase().includes('oauth') ||
                          errorMessage.toLowerCase().includes('authorization required') ||
                          errorStatus === 403 ||
                          errorStatus === 401 ||
                          error.code === 'OAUTH_REQUIRED';

      let userFriendlyMessage = errorMessage;
      if (isOAuthError) {
        userFriendlyMessage = 'OAuth authorization required or token expired. Please go to Settings and re-authorize the application to access your Allegro Sales Center offers.';
      }

      throw new HttpException(
        {
          success: false,
          error: {
            code: isOAuthError ? 'OAUTH_REQUIRED' : 'IMPORT_ERROR',
            message: userFriendlyMessage,
            status: errorStatus,
            requiresOAuth: isOAuthError,
            oauthSettingsUrl: '/dashboard/settings',
            details: errorData,
          },
        },
        errorStatus,
      );
    }
  }

  @Post('import/sales-center')
  @UseGuards(JwtAuthGuard)
  async importFromSalesCenter(@Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user.id);
    const result = await this.offersService.importFromSalesCenter(userId);
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
  async getOffer(@Param('id') id: string, @Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user?.id || 'unknown');
    try {
      this.logger.log('Getting offer details', {
        userId,
        offerId: id,
      });
      const offer = await this.offersService.getOffer(id);
      this.metricsService.incrementDetailRequests();
      this.logger.log('Offer details retrieved', {
        userId,
        offerId: id,
        allegroOfferId: offer.allegroOfferId,
        hasRawData: !!offer.rawData,
      });
      return { success: true, data: offer };
    } catch (error: any) {
      this.metricsService.incrementErrors();
      throw error;
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createOffer(@Body() dto: CreateOfferDto): Promise<{ success: boolean; data: any }> {
    const offer = await this.offersService.createOffer(dto);
    return { success: true, data: offer };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateOffer(@Param('id') id: string, @Body() dto: UpdateOfferDto, @Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user?.id || 'unknown');
    try {
      this.logger.log('Updating offer', {
        userId,
        offerId: id,
        fields: Object.keys(dto),
      });
      const offer = await this.offersService.updateOffer(id, dto, userId);
      this.logger.log('Offer updated successfully', {
        userId,
        offerId: id,
        allegroOfferId: offer.allegroOfferId,
        validationStatus: offer.validationStatus,
      });
      return { success: true, data: offer };
    } catch (error: any) {
      this.metricsService.incrementErrors();
      this.logger.error('Failed to update offer', {
        userId,
        offerId: id,
        error: error.message,
        errorStatus: error.status,
      });
      throw error;
    }
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

  @Post(':id/validate')
  @UseGuards(JwtAuthGuard)
  async validateOffer(@Param('id') id: string, @Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user?.id || 'unknown');
    try {
      this.logger.log('Validating offer', {
        userId,
        offerId: id,
      });
      const validation = await this.offersService.validateOffer(id, userId);
      this.metricsService.incrementValidationRequests();
      this.logger.log('Offer validation completed', {
        userId,
        offerId: id,
        status: validation.status,
        errorCount: validation.errors.filter(e => e.severity === 'error').length,
        warningCount: validation.errors.filter(e => e.severity === 'warning').length,
      });
      return { success: true, data: validation };
    } catch (error: any) {
      this.metricsService.incrementErrors();
      throw error;
    }
  }

  @Get('metrics')
  @UseGuards(JwtAuthGuard)
  async getMetrics(): Promise<{ success: boolean; data: any }> {
    return {
      success: true,
      data: this.metricsService.getMetrics(),
    };
  }
}

