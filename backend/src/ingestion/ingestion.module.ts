import { Module } from '@nestjs/common';
import { CostModelModule } from '../cost-model/cost-model.module';
import { GovernanceModule } from '../governance/governance.module';
import { CloudConnectionSchedulerService } from './cloud-connection-scheduler.service';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [CostModelModule, GovernanceModule],
  controllers: [IngestionController],
  providers: [IngestionService, CloudConnectionSchedulerService]
})
export class IngestionModule {}
