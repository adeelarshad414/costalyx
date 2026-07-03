import { Controller, Get, Header, Query } from '@nestjs/common';
import { CostModelService } from './cost-model.service';
import { ListCostRecordsQueryDto } from './dto/list-cost-records-query.dto';
import { RequiredRole } from '../security/roles.decorator';

@Controller('api/v1')
export class CostRecordsController {
  constructor(private readonly costModel: CostModelService) {}

  @Get('cost-records')
  @RequiredRole('viewer')
  listCostRecords(@Query() query: ListCostRecordsQueryDto) {
    return this.costModel.listRecords(query);
  }

  @Get('cost-records/summary')
  @RequiredRole('viewer')
  getCostRecordsSummary() {
    return this.costModel.getSummary();
  }

  @Get('cost-records/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @RequiredRole('viewer')
  async exportCostRecords() {
    const records = await this.costModel.listRecords({ page: 1, pageSize: 200 });
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
