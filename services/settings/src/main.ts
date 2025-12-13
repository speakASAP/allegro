/**
 * Settings Service Main Entry Point
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

  // Add request logging middleware to track incoming requests
  app.use((req: any, res: any, next: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [HTTP] Incoming request: ${req.method} ${req.url}`);
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] [HTTP] Request completed: ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
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

  const port = configService.get<string>('ALLEGRO_SETTINGS_SERVICE_PORT') || configService.get<string>('PORT');
  if (!port) {
    throw new Error('ALLEGRO_SETTINGS_SERVICE_PORT or PORT must be configured in .env file');
  }
  await app.listen(parseInt(port));
  console.log(`Settings Service is running on: http://localhost:${port}`);
}

bootstrap();

