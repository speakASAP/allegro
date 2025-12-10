/**
 * JWT Auth Guard
 * Validates JWT tokens using auth-microservice
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();
    const path = request.url || request.path || 'unknown';
    
    try {
      const token = this.extractTokenFromHeader(request);

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Log before validation
      console.log(`[JwtAuthGuard] Starting token validation for ${path}`, {
        hasToken: !!token,
        tokenLength: token?.length || 0,
        timestamp: new Date().toISOString(),
      });

      const validationStartTime = Date.now();
      const validation = await this.authService.validateToken(token);
      const validationDuration = Date.now() - validationStartTime;

      // Log after validation
      console.log(`[JwtAuthGuard] Token validation completed for ${path}`, {
        valid: validation.valid,
        hasUser: !!validation.user,
        validationDuration: `${validationDuration}ms`,
        totalDuration: `${Date.now() - startTime}ms`,
      });

      if (!validation.valid || !validation.user) {
        throw new UnauthorizedException('Invalid token');
      }

      // Attach user to request
      request.user = validation.user;
      return true;
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      console.error(`[JwtAuthGuard] Token validation failed for ${path}`, {
        error: error.message,
        errorType: error.constructor?.name,
        totalDuration: `${totalDuration}ms`,
        timestamp: new Date().toISOString(),
      });

      // Ensure we always throw UnauthorizedException for auth failures
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // If any other error occurs (e.g., timeout, network error), throw UnauthorizedException
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

