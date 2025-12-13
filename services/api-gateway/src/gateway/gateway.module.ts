/**
 * Gateway Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '@allegro/shared';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import * as http from 'http';
import * as https from 'https';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // Create HTTP and HTTPS agents with keep-alive to reuse connections
        // This eliminates the 17-second delay on first connection
        const httpAgent = new http.Agent({
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 50,
          maxFreeSockets: 10,
          timeout: 60000,
        });
        
        const httpsAgent = new https.Agent({
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 50,
          maxFreeSockets: 10,
          timeout: 60000,
        });

        const timeout = configService.get<string>('HTTP_TIMEOUT') || '30000';
        
        return {
          timeout: parseInt(timeout),
          maxRedirects: 5,
          httpAgent,
          httpsAgent,
          // Set default headers for keep-alive
          headers: {
            'Connection': 'keep-alive',
          },
        };
      },
      inject: [ConfigService],
    }),
    ConfigModule,
    AuthModule,
  ],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}

