/**
 * Settings Service Main Entry Point
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
 * Global exception filter to ensure errors are properly formatted
 * and don't fall through as 500 in upstream gateway.
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

    // Handle plain Error objects (not HttpException)
    if (!isHttp && exception instanceof Error) {
      const errorMessage = exception.message || 'Internal server error';
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: errorMessage,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        },
      });
      return;
    }

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

  // Add request logging middleware to track incoming requests
  app.use((req: any, res: any, next: any) => {
    const timestamp = new Date().toISOString();
    const connectionTime = Date.now();
    const remoteAddress = req.socket?.remoteAddress || req.ip || 'unknown';
    const remotePort = req.socket?.remotePort || 'unknown';
    
    console.log(`[${timestamp}] [HTTP] Incoming request: ${req.method} ${req.url}`, {
      remoteAddress,
      remotePort,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        connection: req.headers.connection,
      },
      socketReadyState: req.socket?.readyState,
      socketLocalAddress: req.socket?.localAddress,
      socketLocalPort: req.socket?.localPort,
    });
    
    const startTime = Date.now();
    
    // Log when connection was established (socket ready)
    if (req.socket) {
      const socketReadyTime = Date.now();
      console.log(`[${new Date().toISOString()}] [HTTP] Socket connection details`, {
        method: req.method,
        url: req.url,
        socketReadyState: req.socket.readyState,
        socketLocalAddress: req.socket.localAddress,
        socketLocalPort: req.socket.localPort,
        socketRemoteAddress: req.socket.remoteAddress,
        socketRemotePort: req.socket.remotePort,
        timeSinceRequestReceived: socketReadyTime - connectionTime,
      });
    }
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] [HTTP] Request completed: ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`, {
        remoteAddress,
        remotePort,
        totalTimeSinceConnection: Date.now() - connectionTime,
      });
    });
    
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  const port = configService.get<string>('ALLEGRO_SETTINGS_SERVICE_PORT') || configService.get<string>('PORT');
  if (!port) {
    throw new Error('ALLEGRO_SETTINGS_SERVICE_PORT or PORT must be configured in .env file');
  }
  await app.listen(parseInt(port));
  console.log(`Settings Service is running on: http://localhost:${port}`);
}

bootstrap();

