/**
 * Allegro Service Main Entry Point
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env file before any other imports
config({ path: join(process.cwd(), '../../.env') });

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

  const port = configService.get<string>('ALLEGRO_SERVICE_PORT') || configService.get<string>('PORT');
  if (!port) {
    throw new Error('ALLEGRO_SERVICE_PORT or PORT must be configured in .env file');
  }
  await app.listen(parseInt(port));
  console.log(`Allegro Service is running on: http://localhost:${port}`);
}

bootstrap();

