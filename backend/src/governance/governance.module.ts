import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GovernanceController } from './governance.controller';
import { GOVERNANCE_REPOSITORY } from './governance.repository';
import { GovernanceService } from './governance.service';
import { InMemoryGovernanceRepository } from './in-memory-governance.repository';
import { PostgresGovernanceRepository } from './postgres-governance.repository';

@Module({
  controllers: [GovernanceController],
  providers: [
    GovernanceService,
    {
      provide: GOVERNANCE_REPOSITORY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        return databaseUrl ? new PostgresGovernanceRepository(databaseUrl) : new InMemoryGovernanceRepository();
      }
    }
  ],
  exports: [GovernanceService]
})
export class GovernanceModule {}
