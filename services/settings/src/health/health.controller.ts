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
      service: 'settings',
      timestamp: new Date().toISOString(),
    };
  }
}
