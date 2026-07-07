import { Controller, Get } from '@nestjs/common';
import { RequiredRole } from '../security/roles.decorator';
import { OperatorReadinessService } from './operator-readiness.service';

@Controller('api/v1')
export class OperatorReadinessController {
  constructor(private readonly readiness: OperatorReadinessService) {}

  @Get('operator-readiness')
  @RequiredRole('admin')
  getOperatorReadiness() {
    return this.readiness.getReadiness();
  }
}
