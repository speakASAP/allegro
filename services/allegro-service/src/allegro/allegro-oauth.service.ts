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
    this.authorizeUrl = this.configService.get<string>('ALLEGRO_OAUTH_AUTHORIZE_URL') || 'https://allegro.pl/auth/oauth/authorize';
    this.tokenUrl = this.configService.get<string>('ALLEGRO_OAUTH_TOKEN_URL') || 'https://allegro.pl/auth/oauth/token';
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
    scopes: string[] = ['sale:offers:read', 'sale:offers:write'],
  ): { url: string; state: string; codeVerifier: string } {
    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');
    
    // Generate PKCE
    const { codeVerifier, codeChallenge } = this.generatePKCE();

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `${this.authorizeUrl}?${params.toString()}`;

    this.logger.debug('Generated Allegro OAuth authorization URL', {
      clientId: clientId.substring(0, 8) + '...',
      redirectUri,
      scopes,
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
    try {
      const response = await firstValueFrom(
        this.httpService.post<TokenResponse>(
          this.tokenUrl,
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
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
      this.logger.error('Failed to exchange authorization code for token', {
        error: error.message,
        status: error.response?.status,
        errorData: error.response?.data,
      });
      throw new Error(
        `Failed to exchange authorization code: ${error.response?.data?.error_description || error.message}`,
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

