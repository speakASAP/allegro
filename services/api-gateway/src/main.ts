/**
 * API Gateway Main Entry Point
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

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

  // Enable CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  if (corsOrigin) {
    app.enableCors({
      origin: corsOrigin,
      credentials: true,
    });
  }

  const port = configService.get<string>('API_GATEWAY_PORT') || configService.get<string>('PORT') || '3411';
  await app.listen(parseInt(port));
  console.log(`API Gateway is running on: http://localhost:${port}`);
}

bootstrap();

