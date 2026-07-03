import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ALLOCATION_REPOSITORY, type AllocationRepository } from '../allocation/allocation.repository';
import { AllocationModule } from '../allocation/allocation.module';
import { GovernanceModule } from '../governance/governance.module';
import { COST_MODEL_REPOSITORY } from './cost-model.repository';
import { CostModelService } from './cost-model.service';
import { CostRecordsController } from './cost-records.controller';
import { InMemoryCostModelRepository } from './in-memory-cost-model.repository';
import { PostgresCostModelRepository } from './postgres-cost-model.repository';

@Module({
  imports: [AllocationModule, GovernanceModule],
  controllers: [CostRecordsController],
  providers: [
    CostModelService,
    {
      provide: COST_MODEL_REPOSITORY,
      inject: [ConfigService, ALLOCATION_REPOSITORY],
      useFactory: (config: ConfigService, allocation: AllocationRepository) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        return databaseUrl ? new PostgresCostModelRepository(databaseUrl) : new InMemoryCostModelRepository(allocation);
      }
    }
  ],
  exports: [CostModelService]
})
export class CostModelModule {}
