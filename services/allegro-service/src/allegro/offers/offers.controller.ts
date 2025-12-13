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
    this.logger.log('[importOffers] Import request received', {
      userId: req.user?.id,
      userSub: req.user?.sub,
      hasUser: !!req.user,
      userKeys: req.user ? Object.keys(req.user) : [],
      userObject: req.user ? JSON.stringify(req.user) : 'null',
    });
    
    try {
      // Extract user ID - try multiple sources
      const userId = String(req.user?.id || req.user?.sub || req.user?.userId || 'unknown');
      
      if (!req.user) {
        this.logger.error('[importOffers] No user object in request', {
          hasUser: false,
        });
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'AUTH_ERROR',
              message: 'User authentication failed. Please log in again.',
              status: HttpStatus.UNAUTHORIZED,
            },
          },
          HttpStatus.UNAUTHORIZED,
        );
      }
      
      if (userId === 'unknown' || userId === 'undefined' || userId === 'null') {
        this.logger.error('[importOffers] Missing user ID in request', {
          hasUser: !!req.user,
          userKeys: req.user ? Object.keys(req.user) : [],
          userId: req.user?.id,
          userSub: req.user?.sub,
          userUserId: req.user?.userId,
          userObject: JSON.stringify(req.user),
        });
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'AUTH_ERROR',
              message: 'User ID not found in authentication token. Please log in again.',
              status: HttpStatus.UNAUTHORIZED,
            },
          },
          HttpStatus.UNAUTHORIZED,
        );
      }
      
      this.logger.log('[importOffers] Starting importAllOffers', { userId });
      const result = await this.offersService.importAllOffers(userId);
      this.logger.log('[importOffers] Import completed successfully', {
        userId,
        totalImported: result?.totalImported || 0,
      });
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
  async createOffer(@Body() dto: CreateOfferDto, @Request() req: any): Promise<{ success: boolean; data: any }> {
    const startTime = Date.now();
    const requestId = `create-offer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const userId = String(req.user?.id || req.user?.sub || 'unknown');
    
    this.logger.log(`[${requestId}] [createOffer] Create offer request received`, {
      userId,
      hasTitle: !!dto.title,
      hasCategoryId: !!dto.categoryId,
      hasPrice: dto.price !== undefined,
      hasQuantity: dto.quantity !== undefined,
      syncToAllegro: dto.syncToAllegro,
      hasAllegroProductId: !!dto.allegroProductId,
      dtoKeys: Object.keys(dto),
      timestamp: new Date().toISOString(),
    });

    try {
    const offer = await this.offersService.createOffer(dto, userId);
      const duration = Date.now() - startTime;
      
      this.logger.log(`[${requestId}] [createOffer] Offer created successfully`, {
        userId,
        offerId: offer.id,
        allegroOfferId: offer.allegroOfferId,
        syncStatus: offer.syncStatus,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      
    return { success: true, data: offer };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.metricsService.incrementErrors();
      
      this.logger.error(`[${requestId}] [createOffer] Failed to create offer`, {
        userId,
        error: error.message,
        errorCode: error.code,
        errorStack: error.stack,
        errorStatus: error.status || error.response?.status,
        errorData: error.response?.data,
        duration: `${duration}ms`,
        dtoKeys: Object.keys(dto),
        timestamp: new Date().toISOString(),
      });
      
      throw error;
    }
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

  @Post(':id/sync-to-allegro')
  @UseGuards(JwtAuthGuard)
  async syncToAllegro(@Param('id') id: string, @Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user?.id || 'unknown');
    this.logger.log('[syncToAllegro] Sync-to-Allegro endpoint called', {
      offerId: id,
      userId,
      timestamp: new Date().toISOString(),
    });
    try {
      const result = await this.offersService.updateOffer(id, { syncToAllegro: true }, userId);
      this.logger.log('[syncToAllegro] Sync-to-Allegro completed successfully', {
        offerId: id,
        userId,
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : [],
        timestamp: new Date().toISOString(),
      });
      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error('[syncToAllegro] Sync-to-Allegro failed', {
        offerId: id,
        userId,
        error: error.message,
        errorStack: error.stack,
        errorStatus: error.status,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  @Post(':id/sync-from-allegro')
  @UseGuards(JwtAuthGuard)
  async syncFromAllegro(@Param('id') id: string, @Request() req: any): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user?.id || 'unknown');
    try {
      this.logger.log('Syncing offer from Allegro', {
        userId,
        offerId: id,
      });
    const result = await this.offersService.syncOfferFromAllegro(id, userId);
      this.logger.log('Offer synced from Allegro successfully', {
        userId,
        offerId: id,
        allegroOfferId: result?.allegroOfferId,
      });
    return { success: true, data: result };
    } catch (error: any) {
      this.metricsService.incrementErrors();
      const errorStatus = error.response?.status || error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error?.message || errorData.message || error.message || 'Failed to sync offer from Allegro';

      this.logger.error('Failed to sync offer from Allegro', {
        userId,
        offerId: id,
        error: error.message,
        errorStatus,
        errorCode: error.code,
        errorStack: error.stack,
        allegroError: errorData,
        responseData: error.response?.data,
      });

      // Handle OAuth-related errors
      if (errorStatus === 403 || error.code === 'OAUTH_REQUIRED' || errorMessage.includes('OAuth')) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'OAUTH_REQUIRED',
              message: 'OAuth authorization required. Please authorize the application in Settings to access your Allegro offers.',
              status: HttpStatus.FORBIDDEN,
            },
          },
          HttpStatus.FORBIDDEN,
        );
      }

      // Handle Allegro API errors
      if (errorStatus === 404 || errorMessage.includes('not found')) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'OFFER_NOT_FOUND',
              message: 'Offer not found in Allegro. It may have been deleted or is no longer accessible.',
              status: HttpStatus.NOT_FOUND,
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Handle other errors
      throw error;
    }
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

  @Post('publish-all')
  @UseGuards(JwtAuthGuard)
  async publishAllOffers(
    @Request() req: any,
    @Body() body: { offerIds?: string[] },
    @Query() query: OfferQueryDto,
  ): Promise<{ success: boolean; data: any }> {
    const userId = String(req.user?.id || 'unknown');
    const requestId = `publish-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      this.logger.log(`[${requestId}] [publishAllOffers] ========== PUBLISH ALL REQUEST RECEIVED ==========`, {
        userId,
        requestId,
        offerIdsProvided: !!body.offerIds,
        offerIdsCount: body.offerIds?.length || 0,
        offerIds: body.offerIds || [],
        hasFilters: !!(query.status || query.search || query.categoryId),
        queryParams: query,
        bodyKeys: Object.keys(body),
        bodyContent: JSON.stringify(body, null, 2),
        queryContent: JSON.stringify(query, null, 2),
        timestamp: new Date().toISOString(),
        step: 'CONTROLLER_ENTRY',
      });

      let offerIds: string[] = [];

      if (body.offerIds && body.offerIds.length > 0) {
        // Use provided offer IDs
        offerIds = body.offerIds;
        this.logger.log(`[${requestId}] [publishAllOffers] Using provided offer IDs`, {
          offerIdsCount: offerIds.length,
          firstFewIds: offerIds.slice(0, 5),
        });
      } else {
        // Use same filters as GET /allegro/offers to get filtered offers
        const where: any = {};
        if (query.status) {
          where.status = query.status;
        }
        if (query.categoryId) {
          where.categoryId = query.categoryId;
        }
        if (query.search) {
          where.title = {
            contains: query.search,
            mode: 'insensitive',
          };
        }

        this.logger.log(`[${requestId}] [publishAllOffers] Fetching offers with filters`, {
          where,
          query,
        });

        const offers = await this.offersService.getOffers({
          ...query,
          limit: 1000, // Get all matching offers
          page: 1,
        });

        offerIds = offers.items.map((offer: any) => offer.id);
        this.logger.log(`[${requestId}] [publishAllOffers] Fetched offers from database`, {
          totalOffers: offers.items.length,
          offerIdsCount: offerIds.length,
        });
      }

      if (offerIds.length === 0) {
        this.logger.log(`[${requestId}] [publishAllOffers] No offers to publish`, {
          userId,
        });
        return {
          success: true,
          data: {
            total: 0,
            successful: 0,
            failed: 0,
            results: [],
            message: 'No offers to publish',
            requestId,
          },
        };
      }

      this.logger.log(`[${requestId}] [publishAllOffers] ========== STARTING PUBLISH OPERATION ==========`, {
        userId,
        offerCount: offerIds.length,
        offerIds: offerIds.slice(0, 10), // Log first 10
        allOfferIds: offerIds, // Log all for debugging
        requestId,
        timestamp: new Date().toISOString(),
        step: 'BEFORE_SERVICE_CALL',
        memoryUsage: process.memoryUsage(),
      });

      // Wait for publish operation to complete and return results
      try {
        this.logger.log(`[${requestId}] [publishAllOffers] Calling publishOffersToAllegro service method`, {
          userId,
          offerCount: offerIds.length,
          requestId,
          timestamp: new Date().toISOString(),
          step: 'SERVICE_CALL_START',
        });
        
        const result = await this.offersService.publishOffersToAllegro(userId, offerIds, requestId);
        
        this.logger.log(`[${requestId}] [publishAllOffers] Service method returned`, {
          userId,
          requestId,
          hasResult: !!result,
          resultKeys: result ? Object.keys(result) : [],
          timestamp: new Date().toISOString(),
          step: 'SERVICE_CALL_COMPLETE',
        });

        const totalDuration = Date.now() - startTime;
        this.logger.log(`[${requestId}] [publishAllOffers] Publish completed`, {
          userId,
          requestId,
          total: result.total,
          successful: result.successful,
          failed: result.failed,
          totalDuration: `${totalDuration}ms`,
          totalDurationSeconds: Math.round(totalDuration / 1000),
          timestamp: new Date().toISOString(),
        });

        // Return actual results
        return {
          success: true,
          data: {
            requestId,
            status: 'completed',
            total: result.total,
            successful: result.successful,
            failed: result.failed,
            results: result.results,
            message: `Published ${result.successful} of ${result.total} offers successfully. ${result.failed > 0 ? `${result.failed} failed.` : ''}`,
            completedAt: new Date().toISOString(),
            duration: `${totalDuration}ms`,
          },
        };
      } catch (error: any) {
        const totalDuration = Date.now() - startTime;
        this.logger.error(`[${requestId}] [publishAllOffers] Publish failed`, {
          userId,
          requestId,
          error: error.message,
          errorCode: error.code,
          errorStack: error.stack,
          totalDuration: `${totalDuration}ms`,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    } catch (error: any) {
      const requestDuration = Date.now() - startTime;
      this.metricsService.incrementErrors();
      const errorStatus = error.response?.status || error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error || errorData.message || error.message || 'Failed to publish offers';

      this.logger.error(`[${requestId}] [publishAllOffers] Failed to start publish operation`, {
        error: error.message,
        status: errorStatus,
        userId: req.user?.id,
        requestId,
        requestDuration: `${requestDuration}ms`,
        errorData: JSON.stringify(errorData, null, 2),
        errorStack: error.stack,
        timestamp: new Date().toISOString(),
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
            code: isOAuthError ? 'OAUTH_REQUIRED' : 'PUBLISH_ERROR',
            message: userFriendlyMessage,
            status: errorStatus,
            requiresOAuth: isOAuthError,
            oauthSettingsUrl: '/dashboard/settings',
            details: errorData,
            requestId,
          },
        },
        errorStatus,
      );
    }
  }
}

