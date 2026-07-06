import { Controller, Get } from '@nestjs/common';
import { BusinessHealthService } from './business-health.service';
import { AllegroChannelReadbackBusinessHealthEnvelope } from './business-health.types';

@Controller('allegro/business-health')
export class BusinessHealthController {
  constructor(private readonly businessHealthService: BusinessHealthService) {}

  @Get('channel-readback')
  getChannelReadback(): AllegroChannelReadbackBusinessHealthEnvelope {
    return this.businessHealthService.getChannelReadbackEnvelope();
  }
}
