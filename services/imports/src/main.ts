/**
 * Import Service Main Entry Point
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env file before any other imports
config({ path: join(process.cwd(), '../../.env') });

import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  HttpException,
  HttpStatus,
  ArgumentsHost,
  ExceptionFilter,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/**
 * Global exception filter to ensure auth errors surface as 401
 * instead of falling through as 500 in upstream gateway.
 */
class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? exception.getResponse() : null;
    const payload =
      typeof body === 'string' ? { message: body } : (body as Record<string, any> | null) || {};

    if (status === HttpStatus.UNAUTHORIZED) {
      response.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        error: {
          code: payload?.['code'] || 'UNAUTHORIZED',
          message: payload?.['message'] || 'Authentication required',
          statusCode: HttpStatus.UNAUTHORIZED,
        },
      });
      return;
    }

    response.status(status).json({
      success: false,
      error: {
        code: payload?.['code'] || payload?.['error']?.code || 'INTERNAL_SERVER_ERROR',
        message:
          payload?.['message'] ||
          payload?.['error']?.message ||
          'Internal server error',
        statusCode: status,
      },
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  const port = configService.get<string>('IMPORT_SERVICE_PORT') || configService.get<string>('PORT');
  if (!port) {
    throw new Error('IMPORT_SERVICE_PORT or PORT must be configured in .env file');
  }
  await app.listen(parseInt(port));
  console.log(`Import Service is running on: http://localhost:${port}`);
}

bootstrap();

