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
    // In production (Docker), ENCRYPTION_KEY is passed as environment variable
    // In development, it should be loaded by ConfigModule from .env file
    // Try multiple sources to match production behavior
    let encryptionKey = this.configService.get<string>('ENCRYPTION_KEY') || process.env.ENCRYPTION_KEY;

    // If key is missing or too short, try reading directly from .env file (fallback for dev)
    if (!encryptionKey || encryptionKey.length < 32) {
      const fs = require('fs');
      const path = require('path');
      // Try multiple possible paths
      const possiblePaths = [
        path.join(process.cwd(), '../../.env'), // From service directory
        path.join(process.cwd(), '.env'), // From project root if running from there
      ];
      
      // Add __dirname path if available (for compiled code in production)
      if (typeof __dirname !== 'undefined') {
        possiblePaths.push(path.resolve(__dirname, '../../../.env'));
      }
      
      for (const envPath of possiblePaths) {
        try {
          if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            // Match ENCRYPTION_KEY=value (handle special characters, no quotes needed)
            const keyMatch = envContent.match(/^ENCRYPTION_KEY=(.+)$/m);
            if (keyMatch) {
              // Remove quotes if present and trim
              const extractedKey = keyMatch[1].trim().replace(/^["']|["']$/g, '');
              if (extractedKey && extractedKey.length >= 32) {
                encryptionKey = extractedKey;
                this.logger.log(`ENCRYPTION_KEY loaded from file: ${envPath}`);
                break;
              }
            }
          }
        } catch (error) {
          // Continue to next path
          continue;
        }
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
   * GET /allegro/oauth/authorize?accountId=xxx
   */
  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  async authorize(@Req() req: any, @Query('accountId') accountId?: string) {
    const userId = String(req.user.id);

    this.logger.log('Generating Allegro OAuth authorization URL', { userId, accountId });

    if (!accountId) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'ACCOUNT_ID_REQUIRED',
            message: 'Account ID is required. Please specify accountId query parameter.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get account by accountId and userId
    const account = await this.prisma.allegroAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Allegro account not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!account.clientId) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CREDENTIALS_REQUIRED',
            message: 'Allegro API credentials not configured for this account. Please configure Client ID and Client Secret in Settings first.',
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

    // Normalize redirect URI to ensure consistency (remove trailing slashes)
    const normalizedRedirectUri = redirectUri.trim().replace(/\/+$/, '');

    this.logger.log('Generating authorization URL with normalized redirect URI', {
      userId,
      accountId,
      redirectUri: normalizedRedirectUri,
      originalRedirectUri: redirectUri,
    });

    // Generate authorization URL with PKCE
    const { url, state, codeVerifier } = this.oauthService.generateAuthorizationUrl(
      account.clientId,
      normalizedRedirectUri,
    );

    // Clear any old OAuth state first to prevent conflicts
    // Then store new state and code verifier in account
    const trimmedState = state.trim();
    await this.prisma.allegroAccount.update({
      where: { id: accountId },
      data: {
        oAuthState: trimmedState,
        oAuthCodeVerifier: this.encrypt(codeVerifier),
      },
    });

    this.logger.log('Generated OAuth authorization URL', { userId, accountId, state });

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
    const callbackReceivedLog = {
      hasCode: !!code,
      codeLength: code?.length,
      codeFirstChars: code?.substring(0, 20) + '...',
      hasState: !!state,
      stateLength: state?.length,
      stateFirstChars: state?.substring(0, 20) + '...',
      timestamp: new Date().toISOString(),
    };
    console.log('[OAuth Callback] Received callback', JSON.stringify(callbackReceivedLog, null, 2));
    
    if (!code || !state) {
      const errorLog = { 
        hasCode: !!code, 
        hasState: !!state,
        codeLength: code?.length,
        stateLength: state?.length,
      };
      this.logger.error('OAuth callback missing code or state', errorLog);
      console.error('[OAuth Callback] Missing code or state', JSON.stringify(errorLog, null, 2));
      return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=missing_parameters`);
    }

    // Trim and validate code and state
    const trimmedCode = code.trim();
    const trimmedState = state.trim();

    if (!trimmedCode || !trimmedState) {
      const errorLog = { 
        codeLength: trimmedCode?.length,
        stateLength: trimmedState?.length,
        originalCodeLength: code?.length,
        originalStateLength: state?.length,
      };
      this.logger.error('OAuth callback code or state is empty after trimming', errorLog);
      console.error('[OAuth Callback] Code or state empty after trimming', JSON.stringify(errorLog, null, 2));
      return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=invalid_parameters`);
    }

    const processingLog = { 
      state: trimmedState.substring(0, 20) + '...',
      stateLength: trimmedState.length,
      code: trimmedCode.substring(0, 20) + '...',
      codeLength: trimmedCode.length,
      timestamp: new Date().toISOString(),
    };
    this.logger.log('Processing OAuth callback', processingLog);
    console.log('[OAuth Callback] Processing callback', JSON.stringify(processingLog, null, 2));

    try {
      // Find account by OAuth state (use trimmed state)
      const account = await this.prisma.allegroAccount.findFirst({
        where: { oAuthState: trimmedState },
      });

      if (!account) {
        // Log all accounts with OAuth state for debugging
        const accountsWithState = await this.prisma.allegroAccount.findMany({
          where: { oAuthState: { not: null } },
          select: { id: true, userId: true, name: true, oAuthState: true },
        });
        
        this.logger.error('OAuth state not found', { 
          state: trimmedState,
          stateLength: trimmedState.length,
          accountsWithState: accountsWithState.map(acc => ({
            id: acc.id,
            userId: acc.userId,
            name: acc.name,
            stateLength: acc.oAuthState?.length,
            stateMatch: acc.oAuthState === trimmedState,
          })),
        });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=invalid_state`);
      }

      this.logger.log('Found OAuth state for account', { 
        userId: account.userId,
        accountId: account.id,
        state: trimmedState,
        hasCodeVerifier: !!account.oAuthCodeVerifier,
      });
      console.log('[OAuth Callback] Found OAuth state for account', { 
        userId: account.userId,
        accountId: account.id,
        state: trimmedState, 
        hasCodeVerifier: !!account.oAuthCodeVerifier 
      });

      // Validate state
      if (!this.oauthService.validateState(trimmedState, account.oAuthState || '')) {
        this.logger.error('OAuth state validation failed', { 
          receivedState: trimmedState, 
          storedState: account.oAuthState,
          statesMatch: trimmedState === account.oAuthState,
        });
        console.error('[OAuth Callback] State validation failed', { 
          receivedState: trimmedState, 
          storedState: account.oAuthState 
        });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=state_mismatch`);
      }

      // Get code verifier
      let codeVerifier: string;
      try {
        console.log('[OAuth Callback] Attempting to decrypt code verifier', { userId: account.userId, accountId: account.id, codeVerifierLength: account.oAuthCodeVerifier?.length });
        codeVerifier = this.decrypt(account.oAuthCodeVerifier || '');
        console.log('[OAuth Callback] Successfully decrypted code verifier', { userId: account.userId, accountId: account.id });
      } catch (error) {
        this.logger.error('Failed to decrypt code verifier', { userId: account.userId, accountId: account.id, error: error.message });
        console.error('[OAuth Callback] Failed to decrypt code verifier', { userId: account.userId, accountId: account.id, error: error.message, errorStack: error.stack });
        // Clear the invalid OAuth state so user can try again
        await this.prisma.allegroAccount.update({
          where: { id: account.id },
          data: {
            oAuthState: null,
            oAuthCodeVerifier: null,
          },
        });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=decryption_failed`);
      }

      // Get redirect URI - must match exactly what was used in authorization URL
      const redirectUri = this.configService.get<string>('ALLEGRO_REDIRECT_URI');
      if (!redirectUri) {
        throw new Error('ALLEGRO_REDIRECT_URI not configured');
      }

      // Normalize redirect URI to ensure consistency (remove trailing slashes)
      const normalizedRedirectUri = redirectUri.trim().replace(/\/+$/, '');

      this.logger.log('Exchanging code for token', {
        userId: account.userId,
        accountId: account.id,
        redirectUri: normalizedRedirectUri,
        originalRedirectUri: redirectUri,
        codeLength: code?.length,
        codeVerifierLength: codeVerifier?.length,
        clientId: account.clientId?.substring(0, 8) + '...',
      });

      // Validate client ID
      if (!account.clientId || account.clientId.trim().length === 0) {
        this.logger.error('Client ID is missing for OAuth token exchange', { userId: account.userId, accountId: account.id });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=client_id_missing`);
      }

      // Decrypt client secret
      let clientSecret: string;
      try {
        if (!account.clientSecret) {
          this.logger.error('Client Secret is missing for OAuth token exchange', { 
            userId: account.userId,
            accountId: account.id,
            hasClientSecret: !!account.clientSecret,
            clientSecretLength: account.clientSecret?.length,
          });
          return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=client_secret_missing`);
        }
        clientSecret = this.decrypt(account.clientSecret);
        
        // Validate decrypted secret is not empty
        if (!clientSecret || clientSecret.trim().length === 0) {
          this.logger.error('Client Secret is empty after decryption', { 
            userId: account.userId,
            accountId: account.id,
            encryptedLength: account.clientSecret?.length,
          });
          return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=client_secret_empty`);
        }
        
        this.logger.log('Client Secret decrypted successfully', {
          userId: account.userId,
          accountId: account.id,
          decryptedLength: clientSecret.length,
        });
      } catch (error) {
        this.logger.error('Failed to decrypt client secret', { 
          userId: account.userId,
          accountId: account.id,
          error: error.message,
          errorStack: error.stack,
          encryptedLength: account.clientSecret?.length,
        });
        return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=decryption_failed`);
      }

      // Validate all parameters before exchange
      this.logger.log('Validating parameters before token exchange', {
        userId: account.userId,
        accountId: account.id,
        hasCode: !!trimmedCode,
        codeLength: trimmedCode?.length,
        hasCodeVerifier: !!codeVerifier,
        codeVerifierLength: codeVerifier?.length,
        hasRedirectUri: !!normalizedRedirectUri,
        redirectUri: normalizedRedirectUri,
        hasClientId: !!account.clientId,
        clientId: account.clientId.substring(0, 8) + '...',
        hasClientSecret: !!clientSecret,
        clientSecretLength: clientSecret?.length,
      });

      // Exchange code for tokens - use normalized redirect URI and trimmed code
      const tokenResponse = await this.oauthService.exchangeCodeForToken(
        trimmedCode,
        codeVerifier,
        normalizedRedirectUri,
        account.clientId,
        clientSecret,
      );

      // Encrypt tokens and check lengths before saving
      const encryptedAccessToken = this.encrypt(tokenResponse.access_token);
      const encryptedRefreshToken = this.encrypt(tokenResponse.refresh_token || '');
      const scopes = tokenResponse.scope || '';
      
      // Log lengths for debugging
      this.logger.log('Token lengths before database save', {
        userId: account.userId,
        accountId: account.id,
        accessTokenLength: tokenResponse.access_token.length,
        encryptedAccessTokenLength: encryptedAccessToken.length,
        refreshTokenLength: (tokenResponse.refresh_token || '').length,
        encryptedRefreshTokenLength: encryptedRefreshToken.length,
        scopesLength: scopes.length,
      });
      console.log('[OAuth Callback] Token lengths before database save', {
        userId: account.userId,
        accountId: account.id,
        accessTokenLength: tokenResponse.access_token.length,
        encryptedAccessTokenLength: encryptedAccessToken.length,
        refreshTokenLength: (tokenResponse.refresh_token || '').length,
        encryptedRefreshTokenLength: encryptedRefreshToken.length,
        scopesLength: scopes.length,
      });

      // Truncate scopes if they exceed database limit (safety check)
      const maxScopesLength = 1000;
      const truncatedScopes = scopes.length > maxScopesLength 
        ? scopes.substring(0, maxScopesLength) 
        : scopes;
      
      if (scopes.length > maxScopesLength) {
        this.logger.warn('Scopes truncated due to length limit', {
          userId: account.userId,
          accountId: account.id,
          originalLength: scopes.length,
          truncatedLength: truncatedScopes.length,
        });
        console.warn('[OAuth Callback] Scopes truncated due to length limit', {
          userId: account.userId,
          accountId: account.id,
          originalLength: scopes.length,
          truncatedLength: truncatedScopes.length,
        });
      }

      // Store tokens in account
      const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
      await this.prisma.allegroAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          tokenScopes: truncatedScopes,
          oAuthState: null,
          oAuthCodeVerifier: null,
        },
      });

      this.logger.log('OAuth authorization successful', {
        userId: account.userId,
        accountId: account.id,
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
   * Verify OAuth configuration
   * GET /allegro/oauth/verify-config?accountId=xxx (optional)
   * Returns configuration details for debugging (without sensitive data)
   */
  @Get('verify-config')
  @UseGuards(JwtAuthGuard)
  async verifyConfig(@Req() req: any, @Query('accountId') accountId?: string) {
    const userId = String(req.user.id);

    try {
      let account;
      if (accountId) {
        account = await this.prisma.allegroAccount.findFirst({
          where: {
            id: accountId,
            userId,
          },
          select: {
            clientId: true,
            clientSecret: true,
            oAuthState: true,
            oAuthCodeVerifier: true,
          },
        });
      } else {
        account = await this.prisma.allegroAccount.findFirst({
          where: {
            userId,
            isActive: true,
          },
          select: {
            clientId: true,
            clientSecret: true,
            oAuthState: true,
            oAuthCodeVerifier: true,
          },
        });
      }

      const redirectUri = this.configService.get<string>('ALLEGRO_REDIRECT_URI');
      const normalizedRedirectUri = redirectUri ? redirectUri.trim().replace(/\/+$/, '') : null;

      return {
        success: true,
        data: {
          hasClientId: !!account?.clientId,
          clientIdPreview: account?.clientId ? account.clientId.substring(0, 8) + '...' : null,
          hasClientSecret: !!account?.clientSecret,
          hasOAuthState: !!account?.oAuthState,
          hasCodeVerifier: !!account?.oAuthCodeVerifier,
          redirectUri: normalizedRedirectUri,
          redirectUriConfigured: !!redirectUri,
          redirectUriNormalized: normalizedRedirectUri !== redirectUri,
        },
      };
    } catch (error: any) {
      this.logger.error('Failed to verify OAuth configuration', { userId, accountId, error: error.message });
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'VERIFICATION_ERROR',
            message: 'Failed to verify OAuth configuration',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get OAuth authorization status
   * GET /allegro/oauth/status?accountId=xxx (optional)
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Req() req: any, @Query('accountId') accountId?: string) {
    const userId = String(req.user.id);
    const startTime = Date.now();

    this.logger.log('Getting OAuth status', { userId, accountId });

    try {
      let account;
      
      if (accountId) {
        // Get specific account
        account = await this.prisma.allegroAccount.findFirst({
          where: {
            id: accountId,
            userId,
          },
          select: {
            accessToken: true,
            tokenExpiresAt: true,
            tokenScopes: true,
          },
        });
      } else {
        // Get active account
        account = await this.prisma.allegroAccount.findFirst({
          where: {
            userId,
            isActive: true,
          },
          select: {
            accessToken: true,
            tokenExpiresAt: true,
            tokenScopes: true,
          },
        });
      }

      const totalDuration = Date.now() - startTime;
      this.logger.log('OAuth status retrieved', {
        userId,
        accountId,
        authorized: !!account?.accessToken,
        totalDuration: `${totalDuration}ms`,
      });

      if (!account?.accessToken) {
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
          expiresAt: account.tokenExpiresAt || undefined,
          scopes: account.tokenScopes || undefined,
        },
      };
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      this.logger.error('Failed to get OAuth status', {
        userId,
        accountId,
        error: error.message,
        errorStack: error.stack,
        totalDuration: `${totalDuration}ms`,
      });
      throw error;
    }
  }

  /**
   * Revoke OAuth authorization
   * POST /allegro/oauth/revoke?accountId=xxx
   */
  @Post('revoke')
  @UseGuards(JwtAuthGuard)
  async revoke(@Req() req: any, @Query('accountId') accountId?: string) {
    const userId = String(req.user.id);

    this.logger.log('Revoking OAuth authorization', { userId, accountId });

    if (!accountId) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'ACCOUNT_ID_REQUIRED',
            message: 'Account ID is required. Please specify accountId query parameter.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const account = await this.prisma.allegroAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Allegro account not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.allegroAccount.update({
      where: { id: accountId },
      data: {
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        tokenScopes: null,
        oAuthState: null,
        oAuthCodeVerifier: null,
      },
    });

    this.logger.log('OAuth authorization revoked', { userId, accountId });

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

