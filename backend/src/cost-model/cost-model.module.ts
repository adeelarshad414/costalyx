import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { COST_MODEL_REPOSITORY } from './cost-model.repository';
import { CostModelService } from './cost-model.service';
import { CostRecordsController } from './cost-records.controller';
import { InMemoryCostModelRepository } from './in-memory-cost-model.repository';
import { PostgresCostModelRepository } from './postgres-cost-model.repository';

@Module({
  controllers: [CostRecordsController],
  providers: [
    CostModelService,
    {
      provide: COST_MODEL_REPOSITORY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        return databaseUrl ? new PostgresCostModelRepository(databaseUrl) : new InMemoryCostModelRepository();
      }
    }
  ],
  exports: [CostModelService]
})
export class CostModelModule {}
