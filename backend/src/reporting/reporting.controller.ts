import { Controller, Get, Headers, Param, Query, Req } from '@nestjs/common';
import { GovernanceService } from '../governance/governance.service';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';
import { ReportListQueryDto, ReportRunQueryDto } from './dto/reporting.dto';
import { ReportingService } from './reporting.service';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@Controller('api/v1')
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly governance: GovernanceService
  ) {}

  @Get('reports')
  @RequiredRole('viewer')
  listReports(@Query() query: ReportListQueryDto) {
    return this.reporting.listReports(query);
  }

  @Get('reports/:id/run')
  @RequiredRole('viewer')
  async runReport(
    @Param('id') id: string,
    @Query() query: ReportRunQueryDto,
    @Headers('x-costalyx-view-id') viewId: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    const scoped = await this.governance.applyViewScope(query, request.user, viewId);
    return this.reporting.runReport(id, scoped);
  }
}
