/**
 * Notification Service
 * Service to send notifications via notifications-microservice
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  SendNotificationDto,
  NotificationResponse,
} from './notification.interface';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { RetryService } from '../resilience/retry.service';
import { FallbackService } from '../resilience/fallback.service';
import { ResilienceMonitor } from '../resilience/resilience.monitor';

@Injectable()
export class NotificationService {
  private readonly notificationServiceUrl: string;
  private readonly logger: LoggerService;
  private readonly circuitBreakerService: CircuitBreakerService;
  private readonly retryService: RetryService;
  private readonly fallbackService: FallbackService;
  private readonly resilienceMonitor: ResilienceMonitor;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    logger: LoggerService,
    circuitBreakerService: CircuitBreakerService,
    retryService: RetryService,
    fallbackService: FallbackService,
    resilienceMonitor: ResilienceMonitor,
  ) {
    this.notificationServiceUrl = this.configService.get<string>('NOTIFICATION_SERVICE_URL') || this.throwConfigError('NOTIFICATION_SERVICE_URL');
    this.logger = logger;
    this.circuitBreakerService = circuitBreakerService;
    this.retryService = retryService;
    this.fallbackService = fallbackService;
    this.resilienceMonitor = resilienceMonitor;
  }

  /**
   * Internal method to send notification via HTTP
   */
  private async sendNotificationHttp(dto: SendNotificationDto): Promise<NotificationResponse> {
    const response = await firstValueFrom(
      this.httpService.post<NotificationResponse>(
        `${this.notificationServiceUrl}/notifications/send`,
        dto,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: parseInt(this.configService.get<string>('NOTIFICATION_SERVICE_TIMEOUT') || this.configService.get<string>('HTTP_TIMEOUT') || '10000'),
        },
      ),
    );
    return response.data;
  }

  /**
   * Send notification via notifications-microservice with resilience patterns
   */
  async sendNotification(
    dto: SendNotificationDto,
  ): Promise<NotificationResponse> {
    const callFn = async () => this.sendNotificationHttp(dto);

    try {
      const maxRetries = parseInt(this.configService.get<string>('NOTIFICATION_RETRY_MAX_ATTEMPTS') || this.configService.get<string>('RETRY_MAX_ATTEMPTS') || '3');
      const retryDelay = parseInt(this.configService.get<string>('NOTIFICATION_RETRY_DELAY_MS') || this.configService.get<string>('RETRY_DELAY_MS') || '1000');
      const response = await this.retryService.retry(
        callFn,
        maxRetries,
        retryDelay,
      );

      this.resilienceMonitor.recordCall('notification-service', true);

      this.logger.log('Notification sent successfully', {
        channel: dto.channel,
        type: dto.type,
        recipient: dto.recipient,
      });

      return response as NotificationResponse;
    } catch (error: any) {
      this.resilienceMonitor.recordCall('notification-service', false);

      this.logger.error('Failed to send notification', {
        error: error.message,
        channel: dto.channel,
        type: dto.type,
        recipient: dto.recipient,
      });

      // Return error response instead of throwing
      return {
        success: false,
        error: {
          code: 'NOTIFICATION_FAILED',
          message: error.message || 'Failed to send notification',
        },
      };
    }
  }

  /**
   * Send order confirmation notification
   */
  async sendOrderConfirmation(
    email: string,
    orderNumber: string,
    total: number,
    currency?: string,
  ): Promise<NotificationResponse> {
    const defaultCurrency = currency || this.configService.get<string>('PRICE_CURRENCY_TARGET') || 'PLN';
    return this.sendNotification({
      channel: 'email',
      type: 'order_confirmation',
      recipient: email,
      subject: `Order Confirmation - ${orderNumber}`,
      message: `Your order ${orderNumber} has been confirmed. Total: ${total} ${defaultCurrency}`,
      templateData: {
        orderNumber,
        total,
        currency: defaultCurrency,
      },
    });
  }

  /**
   * Send stock low notification
   */
  async sendStockLowNotification(
    productCode: string,
    currentStock: number,
    threshold: number,
  ): Promise<NotificationResponse> {
    const adminEmail = this.configService.get<string>('NOTIFICATION_EMAIL_TO') || this.throwConfigError('NOTIFICATION_EMAIL_TO');
    return this.sendNotification({
      channel: 'email',
      type: 'stock_low',
      recipient: adminEmail,
      subject: `Low Stock Alert - ${productCode}`,
      message: `Product ${productCode} has low stock: ${currentStock} (threshold: ${threshold})`,
      templateData: {
        productCode,
        currentStock,
        threshold,
      },
    });
  }

  /**
   * Send sync error notification
   */
  async sendSyncErrorNotification(
    errorMessage: string,
    syncType: string,
  ): Promise<NotificationResponse> {
    const adminEmail = this.configService.get<string>('NOTIFICATION_EMAIL_TO') || this.throwConfigError('NOTIFICATION_EMAIL_TO');
    return this.sendNotification({
      channel: 'email',
      type: 'sync_error',
      recipient: adminEmail,
      subject: `Sync Error - ${syncType}`,
      message: `Sync error occurred: ${errorMessage}`,
      templateData: {
        errorMessage,
        syncType,
      },
    });
  }

  private throwConfigError(key: string): never {
    throw new Error(`Missing required environment variable: ${key}. Please set it in your .env file.`);
  }
}

