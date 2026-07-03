import { Module } from '@nestjs/common';
import { CostModelService } from './cost-model.service';
import { CostRecordsController } from './cost-records.controller';

@Module({
  controllers: [CostRecordsController],
  providers: [CostModelService],
  exports: [CostModelService]
})
export class CostModelModule {}
