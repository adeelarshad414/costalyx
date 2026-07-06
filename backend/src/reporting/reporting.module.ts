import { Module } from '@nestjs/common';
import { CostModelModule } from '../cost-model/cost-model.module';
import { GovernanceModule } from '../governance/governance.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [CostModelModule, GovernanceModule],
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService]
})
export class ReportingModule {}
