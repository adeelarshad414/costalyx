import { Controller, Get } from '@nestjs/common';
import { Public, RequiredRole } from './security/roles.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('healthz')
  getHealthz() {
    return { status: 'ok' };
  }

  @RequiredRole('admin')
  @Get('metrics')
  getMetrics() {
    return '# HELP costalyx_build_info Costalyx local build info\ncostalyx_build_info{version="0.1.0"} 1\n';
  }
}
