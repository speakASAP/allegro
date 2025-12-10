/**
 * Allegro OAuth Service
 * Handles OAuth 2.0 Authorization Code Flow with PKCE
 */

import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '@allegro/shared';
import * as crypto from 'crypto';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

@Injectable()
export class AllegroOAuthService {
  private readonly authorizeUrl: string;
  private readonly tokenUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.authorizeUrl = this.configService.get<string>('ALLEGRO_OAUTH_AUTHORIZE_URL');
    this.tokenUrl = this.configService.get<string>('ALLEGRO_OAUTH_TOKEN_URL');
    
    if (!this.authorizeUrl) {
      throw new Error('ALLEGRO_OAUTH_AUTHORIZE_URL must be configured in .env file');
    }
    if (!this.tokenUrl) {
      throw new Error('ALLEGRO_OAUTH_TOKEN_URL must be configured in .env file');
    }
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    // Generate code verifier (43-128 characters, base64url encoded)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    // Generate code challenge (SHA256 hash of verifier, base64url encoded)
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate authorization URL with PKCE
   */
  generateAuthorizationUrl(
    clientId: string,
    redirectUri: string,
    scopes?: string[],
  ): { url: string; state: string; codeVerifier: string } {
    // Normalize redirect URI - remove trailing slashes and ensure exact match
    const normalizedRedirectUri = redirectUri.trim().replace(/\/+$/, '');
    
    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');
    
    // Generate PKCE
    const { codeVerifier, codeChallenge } = this.generatePKCE();

    // Get scopes from config or use defaults, or omit if not configured
    let finalScopes = scopes;
    if (!finalScopes) {
      const scopeConfig = this.configService.get<string>('ALLEGRO_OAUTH_SCOPES');
      if (scopeConfig) {
        finalScopes = scopeConfig.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
    }

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: normalizedRedirectUri,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    // Only add scope parameter if scopes are provided
    if (finalScopes && finalScopes.length > 0) {
      params.append('scope', finalScopes.join(' '));
    }

    const url = `${this.authorizeUrl}?${params.toString()}`;

    this.logger.debug('Generated Allegro OAuth authorization URL', {
      clientId: clientId.substring(0, 8) + '...',
      redirectUri: normalizedRedirectUri,
      originalRedirectUri: redirectUri,
      scopes: finalScopes || 'none (scope parameter omitted)',
    });

    return { url, state, codeVerifier };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
  ): Promise<TokenResponse> {
    // Normalize redirect URI - remove trailing slashes and ensure exact match
    const normalizedRedirectUri = redirectUri.trim().replace(/\/+$/, '');
    
    this.logger.debug('Exchanging authorization code for token', {
      redirectUri: normalizedRedirectUri,
      codeLength: code?.length,
      codeVerifierLength: codeVerifier?.length,
      clientId: clientId.substring(0, 8) + '...',
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post<TokenResponse>(
          this.tokenUrl,
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: normalizedRedirectUri,
            code_verifier: codeVerifier,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            auth: {
              username: clientId,
              password: clientSecret,
            },
          },
        ),
      );

      this.logger.log('Successfully exchanged authorization code for token', {
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in,
        hasRefreshToken: !!response.data.refresh_token,
        scopes: response.data.scope,
      });

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      const errorDescription = errorData.error_description || errorData.error || error.message;
      const errorCode = errorData.error || 'unknown_error';
      
      this.logger.error('Failed to exchange authorization code for token', {
        error: error.message,
        status: error.response?.status,
        errorCode,
        errorDescription,
        errorData: JSON.stringify(errorData),
        redirectUri: normalizedRedirectUri,
        originalRedirectUri: redirectUri,
        clientId: clientId.substring(0, 8) + '...',
        hasCodeVerifier: !!codeVerifier,
        codeVerifierLength: codeVerifier?.length,
      });
      
      throw new Error(
        `Failed to exchange authorization code: ${errorDescription} (${errorCode})`,
      );
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<TokenResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TokenResponse>(
          this.tokenUrl,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            auth: {
              username: clientId,
              password: clientSecret,
            },
          },
        ),
      );

      this.logger.log('Successfully refreshed access token', {
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in,
        hasRefreshToken: !!response.data.refresh_token,
      });

      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to refresh access token', {
        error: error.message,
        status: error.response?.status,
        errorData: error.response?.data,
      });
      throw new Error(
        `Failed to refresh access token: ${error.response?.data?.error_description || error.message}`,
      );
    }
  }

  /**
   * Validate state parameter (CSRF protection)
   */
  validateState(state: string, storedState: string): boolean {
    if (!state || !storedState) {
      return false;
    }
    return state === storedState;
  }
}

