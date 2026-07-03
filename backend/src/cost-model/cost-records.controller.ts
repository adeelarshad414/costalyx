import { Controller, Get, Query } from '@nestjs/common';
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
}
