/**
 * Health Controller
 */

import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  async getHealth() {
    return {
      status: 'ok',
      service: 'allegro-settings-service',
      timestamp: new Date().toISOString(),
    };
  }
}
