/**
 * Auth Service
 * Service to handle authentication via auth-microservice
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  RegisterDto,
  LoginDto,
  AuthResponse,
  ValidateTokenResponse,
  RefreshTokenDto,
  AuthUser,
} from './auth.interface';
import { LoggerService } from '../logger/logger.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { RetryService } from '../resilience/retry.service';
import { ResilienceMonitor } from '../resilience/resilience.monitor';

@Injectable()
export class AuthService {
  private readonly authServiceUrl: string;
  private readonly logger: LoggerService;
  private readonly circuitBreakerService: CircuitBreakerService;
  private readonly retryService: RetryService;
  private readonly resilienceMonitor: ResilienceMonitor;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    logger: LoggerService,
    circuitBreakerService: CircuitBreakerService,
    retryService: RetryService,
    resilienceMonitor: ResilienceMonitor,
  ) {
    this.authServiceUrl = this.configService.get<string>('AUTH_SERVICE_URL') || this.throwConfigError('AUTH_SERVICE_URL');
    this.logger = logger;
    this.circuitBreakerService = circuitBreakerService;
    this.retryService = retryService;
    this.resilienceMonitor = resilienceMonitor;
  }

  /**
   * Internal method to call auth-microservice via HTTP
   */
  private async callAuthService<T>(
    endpoint: string,
    data?: any,
  ): Promise<T> {
    const response = await firstValueFrom(
      this.httpService.post<T>(
        `${this.authServiceUrl}${endpoint}`,
        data,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: parseInt(this.configService.get<string>('AUTH_SERVICE_TIMEOUT') || this.configService.get<string>('HTTP_TIMEOUT') || '10000'),
        },
      ),
    );
    return response.data;
  }

  /**
   * Register a new user
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const callFn = async () => this.callAuthService<AuthResponse>('/auth/register', dto);

    try {
      const response = await this.retryService.retry(
        callFn,
        3,
        1000,
      );

      this.resilienceMonitor.recordCall('auth-service', true);

      this.logger.log(`User registered successfully`, {
        email: dto.email,
        userId: response?.user?.id,
      });

      return response as AuthResponse;
    } catch (error: any) {
      this.resilienceMonitor.recordCall('auth-service', false);

      this.logger.error('Failed to register user', {
        error: error.message,
        email: dto.email,
        stack: error.stack,
      });

      throw error;
    }
  }

  /**
   * Login user
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const callFn = async () => this.callAuthService<AuthResponse>('/auth/login', dto);

    try {
      const response = await this.retryService.retry(
        callFn,
        3,
        1000,
      );

      this.resilienceMonitor.recordCall('auth-service', true);

      this.logger.log(`User logged in successfully`, {
        email: dto.email,
        userId: response?.user?.id,
      });

      return response as AuthResponse;
    } catch (error: any) {
      this.resilienceMonitor.recordCall('auth-service', false);

      this.logger.error('Failed to login user', {
        error: error.message,
        email: dto.email,
      });

      if (error.response?.status === 401) {
        throw new UnauthorizedException('Invalid credentials');
      }

      throw error;
    }
  }

  /**
   * Validate JWT token
   */
  async validateToken(token: string): Promise<ValidateTokenResponse> {
    const callFn = async () => this.callAuthService<ValidateTokenResponse>('/auth/validate', { token });

    try {
      const maxRetries = parseInt(this.configService.get<string>('AUTH_RETRY_MAX_ATTEMPTS') || this.configService.get<string>('RETRY_MAX_ATTEMPTS') || '2');
      const retryDelay = parseInt(this.configService.get<string>('AUTH_RETRY_DELAY_MS') || this.configService.get<string>('RETRY_DELAY_MS') || '500');
      const response = await this.retryService.retry(
        callFn,
        maxRetries,
        retryDelay,
      );

      this.resilienceMonitor.recordCall('auth-service', true);
      return response as ValidateTokenResponse;
    } catch (error: any) {
      this.resilienceMonitor.recordCall('auth-service', false);

      this.logger.error('Failed to validate token', {
        error: error.message,
      });

      return { valid: false };
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(dto: RefreshTokenDto): Promise<AuthResponse> {
    const callFn = async () => this.callAuthService<AuthResponse>('/auth/refresh', dto);

    try {
      const maxRetries = parseInt(this.configService.get<string>('AUTH_RETRY_MAX_ATTEMPTS') || this.configService.get<string>('RETRY_MAX_ATTEMPTS') || '2');
      const retryDelay = parseInt(this.configService.get<string>('AUTH_RETRY_DELAY_MS') || this.configService.get<string>('RETRY_DELAY_MS') || '500');
      const response = await this.retryService.retry(
        callFn,
        maxRetries,
        retryDelay,
      );

      this.resilienceMonitor.recordCall('auth-service', true);
      return response as AuthResponse;
    } catch (error: any) {
      this.resilienceMonitor.recordCall('auth-service', false);

      this.logger.error('Failed to refresh token', {
        error: error.message,
      });

      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  private throwConfigError(key: string): never {
    throw new Error(`Missing required environment variable: ${key}. Please set it in your .env file.`);
  }
}

