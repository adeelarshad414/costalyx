import { Module } from '@nestjs/common';
import { CostModelModule } from '../cost-model/cost-model.module';
import { GovernanceModule } from '../governance/governance.module';
import { BILLING_SOURCE_READER, DefaultBillingSourceReader } from './billing-source-reader';
import { CloudConnectionSchedulerService } from './cloud-connection-scheduler.service';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [CostModelModule, GovernanceModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    CloudConnectionSchedulerService,
    {
      provide: BILLING_SOURCE_READER,
      useFactory: () => new DefaultBillingSourceReader()
    }
  ]
})
export class IngestionModule {}
