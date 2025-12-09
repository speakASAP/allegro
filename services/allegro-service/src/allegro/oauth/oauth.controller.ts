/**
 * OAuth Controller
 * Handles OAuth 2.0 Authorization Code Flow endpoints
 */

import { Controller, Get, Post, Query, Req, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '@allegro/shared';
import { LoggerService } from '@allegro/shared';
import { AllegroOAuthService } from '../allegro-oauth.service';
import { PrismaService } from '@allegro/shared';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Controller('allegro/oauth')
export class OAuthController {
  private readonly encryptionKey: string;
  private readonly encryptionAlgorithm = 'aes-256-cbc';

  constructor(
    private readonly oauthService: AllegroOAuthService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    // Get encryption key from environment - required for security
    // Read directly from .env file to avoid dotenv parsing issues with special characters (#, $, etc.)
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(process.cwd(), '../../.env');
    let encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');

    // If key is too short (likely truncated by dotenv), read directly from .env file
    if (!encryptionKey || encryptionKey.length < 32) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const keyMatch = envContent.match(/^ENCRYPTION_KEY=(.+)$/m);
        if (keyMatch) {
          // Remove quotes if present and trim
          encryptionKey = keyMatch[1].trim().replace(/^["']|["']$/g, '');
        }
      } catch (error) {
        this.logger.error('Failed to read ENCRYPTION_KEY from .env file', error);
      }
    }

    this.encryptionKey = encryptionKey || 'default-encryption-key-change-in-production-32chars!!';
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      throw new Error(`ENCRYPTION_KEY must be at least 32 characters long (current length: ${this.encryptionKey?.length || 0})`);
    }
    // Log key length for debugging (first 10 chars only for security)
    this.logger.log(`ENCRYPTION_KEY loaded, length: ${this.encryptionKey.length}, first 10 chars: ${this.encryptionKey.substring(0, 10)}`);
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.encryptionAlgorithm, Buffer.from(this.encryptionKey.slice(0, 32), 'utf8'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, Buffer.from(this.encryptionKey.slice(0, 32), 'utf8'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generate authorization URL
   * GET /allegro/oauth/authorize
   */
  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  async authorize(@Req() req: any) {
    const userId = String(req.user.id);

    this.logger.log('Generating Allegro OAuth authorization URL', { userId });

    // Get user settings to retrieve client ID
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings?.allegroClientId) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CREDENTIALS_REQUIRED',
            message: 'Allegro API credentials not configured. Please configure Client ID and Client Secret in Settings first.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get redirect URI from config
    const redirectUri = this.configService.get<string>('ALLEGRO_REDIRECT_URI');
    if (!redirectUri) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'ALLEGRO_REDIRECT_URI not configured. Please set it in .env file.',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Generate authorization URL with PKCE
    const { url, state, codeVerifier } = this.oauthService.generateAuthorizationUrl(
      settings.allegroClientId,
      redirectUri,
    );

    // Clear any old OAuth state first to prevent conflicts with old encrypted data
    // Then store new state and code verifier in database
    await this.prisma.userSettings.update({
      where: { userId },
      data: {
        allegroOAuthState: null,
        allegroOAuthCodeVerifier: null,
      },
    });

    // Now store the new state and code verifier
    await this.prisma.userSettings.update({
      where: { userId },
      data: {
        allegroOAuthState: state,
        allegroOAuthCodeVerifier: this.encrypt(codeVerifier),
      },
    });

    this.logger.log('Generated OAuth authorization URL', { userId, state });

    return {
      success: true,
      data: {
        authorizationUrl: url,
        state: state,
      },
    };
  }

  /**
   * Handle OAuth callback
   * GET /allegro/oauth/callback
   * Note: This endpoint is public (no auth guard) as it's called by Allegro
   */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    if (!code || !state) {
      this.logger.error('OAuth callback missing code or state', { code: !!code, state: !!state });
      return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=missing_parameters`);
    }

    this.logger.log('Processing OAuth callback', { state, code: code.substring(0, 10) + '...' });

    try {
      // Find user by OAuth state
      const settings = await this.prisma.userSettings.findFirst({
        where: { allegroOAuthState: state },
      });

      if (!settings) {
        this.logger.error('OAuth state not found', { state });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=invalid_state`);
      }

      this.logger.log('Found OAuth state for user', { userId: settings.userId, state });
      console.log('[OAuth Callback] Found OAuth state for user', { userId: settings.userId, state, hasCodeVerifier: !!settings.allegroOAuthCodeVerifier });

      // Validate state
      if (!this.oauthService.validateState(state, settings.allegroOAuthState || '')) {
        this.logger.error('OAuth state validation failed', { state, storedState: settings.allegroOAuthState });
        console.error('[OAuth Callback] State validation failed', { state, storedState: settings.allegroOAuthState });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=state_mismatch`);
      }

      // Get code verifier
      let codeVerifier: string;
      try {
        console.log('[OAuth Callback] Attempting to decrypt code verifier', { userId: settings.userId, codeVerifierLength: settings.allegroOAuthCodeVerifier?.length });
        codeVerifier = this.decrypt(settings.allegroOAuthCodeVerifier || '');
        console.log('[OAuth Callback] Successfully decrypted code verifier', { userId: settings.userId });
      } catch (error) {
        this.logger.error('Failed to decrypt code verifier', { userId: settings.userId, error: error.message });
        console.error('[OAuth Callback] Failed to decrypt code verifier', { userId: settings.userId, error: error.message, errorStack: error.stack });
        // Clear the invalid OAuth state so user can try again
        await this.prisma.userSettings.update({
          where: { userId: settings.userId },
          data: {
            allegroOAuthState: null,
            allegroOAuthCodeVerifier: null,
          },
        });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=decryption_failed`);
      }

      // Get redirect URI
      const redirectUri = this.configService.get<string>('ALLEGRO_REDIRECT_URI');
      if (!redirectUri) {
        throw new Error('ALLEGRO_REDIRECT_URI not configured');
      }

      // Decrypt client secret
      let clientSecret: string;
      try {
        clientSecret = this.decrypt(settings.allegroClientSecret || '');
      } catch (error) {
        this.logger.error('Failed to decrypt client secret', { userId: settings.userId, error: error.message });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=decryption_failed`);
      }

      // Exchange code for tokens
      const tokenResponse = await this.oauthService.exchangeCodeForToken(
        code,
        codeVerifier,
        redirectUri,
        settings.allegroClientId || '',
        clientSecret,
      );

      // Store tokens
      const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
      await this.prisma.userSettings.update({
        where: { userId: settings.userId },
        data: {
          allegroAccessToken: this.encrypt(tokenResponse.access_token),
          allegroRefreshToken: this.encrypt(tokenResponse.refresh_token || ''),
          allegroTokenExpiresAt: expiresAt,
          allegroTokenScopes: tokenResponse.scope,
          allegroOAuthState: null,
          allegroOAuthCodeVerifier: null,
        },
      });

      this.logger.log('OAuth authorization successful', {
        userId: settings.userId,
        expiresAt,
        scopes: tokenResponse.scope,
      });

      return res.redirect(`${this.getFrontendUrl()}/auth/callback?success=true`);
    } catch (error: any) {
      this.logger.error('OAuth callback error', {
        error: error.message,
        state,
      });
      return res.redirect(
        `${this.getFrontendUrl()}/auth/callback?error=${encodeURIComponent(error.message)}`,
      );
    }
  }

  /**
   * Get OAuth authorization status
   * GET /allegro/oauth/status
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Req() req: any) {
    const userId = String(req.user.id);
    const startTime = Date.now();

    this.logger.log('Getting OAuth status', { userId });

    try {
      const queryStartTime = Date.now();
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: {
          allegroAccessToken: true,
          allegroTokenExpiresAt: true,
          allegroTokenScopes: true,
        },
      });
      const queryDuration = Date.now() - queryStartTime;

      if (queryDuration > 1000) {
        this.logger.warn('OAuth status query took longer than expected', {
          userId,
          queryDuration: `${queryDuration}ms`,
        });
      } else {
        this.logger.debug('OAuth status query completed', {
          userId,
          queryDuration: `${queryDuration}ms`,
        });
      }

      const totalDuration = Date.now() - startTime;
      this.logger.log('OAuth status retrieved', {
        userId,
        authorized: !!settings?.allegroAccessToken,
        totalDuration: `${totalDuration}ms`,
        queryDuration: `${queryDuration}ms`,
      });

      if (!settings?.allegroAccessToken) {
        return {
          success: true,
          data: {
            authorized: false,
          },
        };
      }

      return {
        success: true,
        data: {
          authorized: true,
          expiresAt: settings.allegroTokenExpiresAt || undefined,
          scopes: settings.allegroTokenScopes || undefined,
        },
      };
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      this.logger.error('Failed to get OAuth status', {
        userId,
        error: error.message,
        errorStack: error.stack,
        totalDuration: `${totalDuration}ms`,
      });
      throw error;
    }
  }

  /**
   * Revoke OAuth authorization
   * POST /allegro/oauth/revoke
   */
  @Post('revoke')
  @UseGuards(JwtAuthGuard)
  async revoke(@Req() req: any) {
    const userId = String(req.user.id);

    this.logger.log('Revoking OAuth authorization', { userId });

    await this.prisma.userSettings.update({
      where: { userId },
      data: {
        allegroAccessToken: null,
        allegroRefreshToken: null,
        allegroTokenExpiresAt: null,
        allegroTokenScopes: null,
        allegroOAuthState: null,
        allegroOAuthCodeVerifier: null,
      },
    });

    this.logger.log('OAuth authorization revoked', { userId });

    return {
      success: true,
      message: 'OAuth authorization revoked successfully',
    };
  }

  /**
   * Get frontend URL for redirects
   * Uses FRONTEND_URL from .env (e.g., https://allegro.statex.cz for prod, http://localhost:3410 for dev)
   */
  private getFrontendUrl(): string {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (frontendUrl) {
      return frontendUrl;
    }
    
    // Fallback: construct from port (for development)
    const frontendPort = this.configService.get<string>('ALLEGRO_FRONTEND_SERVICE_PORT') || '3410';
    return `http://localhost:${frontendPort}`;
  }
}

