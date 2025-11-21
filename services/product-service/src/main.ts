/**
 * Product Service Main Entry Point
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

  const port = configService.get<string>('PRODUCT_SERVICE_PORT') || configService.get<string>('PORT') || '3402';
  await app.listen(parseInt(port));
  console.log(`Product Service is running on: http://localhost:${port}`);
}

bootstrap();

