import { Controller, Get, Header, Headers, Query, Req } from '@nestjs/common';
import { GovernanceService } from '../governance/governance.service';
import { CostModelService } from './cost-model.service';
import { CostExplorerFlowQueryDto, ListCostRecordsQueryDto } from './dto/list-cost-records-query.dto';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@Controller('api/v1')
export class CostRecordsController {
  constructor(
    private readonly costModel: CostModelService,
    private readonly governance: GovernanceService
  ) {}

  @Get('cost-records')
  @RequiredRole('viewer')
  async listCostRecords(
    @Query() query: ListCostRecordsQueryDto,
    @Headers('x-costalyx-view-id') viewId: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    return this.costModel.listRecords(await this.governance.applyViewScope(query, request.user, viewId));
  }

  @Get('cost-records/summary')
  @RequiredRole('viewer')
  async getCostRecordsSummary(
    @Query() query: ListCostRecordsQueryDto,
    @Headers('x-costalyx-view-id') viewId: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    return this.costModel.getSummary(await this.governance.applyViewScope(query, request.user, viewId));
  }

  @Get('cost-explorer/flow')
  @RequiredRole('viewer')
  async getCostExplorerFlow(
    @Query() query: CostExplorerFlowQueryDto,
    @Headers('x-costalyx-view-id') viewId: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    return this.costModel.getExplorerFlow(await this.governance.applyViewScope(query, request.user, viewId));
  }

  @Get('cost-records/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @RequiredRole('viewer')
  async exportCostRecords(
    @Headers('x-costalyx-view-id') viewId: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    const scoped = await this.governance.applyViewScope({ page: 1, pageSize: 200 }, request.user, viewId);
    const records = await this.costModel.listRecords(scoped);
    return [
      'id,provider,accountId,resourceId,serviceName,costTotalUsd,isEstimate',
      ...records.data.map((record) =>
        [
          record.id,
          record.provider,
          record.accountId,
          record.resourceId,
          record.serviceName,
          record.costTotalUsd,
          String(record.isEstimate)
        ]
          .map(csvCell)
          .join(',')
      )
    ].join('\n');
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
