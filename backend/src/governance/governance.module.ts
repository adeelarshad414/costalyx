import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_LOG_STORE, type AuditLogStore } from '../audit/audit-log.store';
import { AuditLogModule } from '../audit/audit-log.module';
import { GovernanceController } from './governance.controller';
import { GOVERNANCE_REPOSITORY } from './governance.repository';
import { GovernanceService } from './governance.service';
import { InMemoryGovernanceRepository } from './in-memory-governance.repository';
import { PostgresGovernanceRepository } from './postgres-governance.repository';

@Module({
  imports: [AuditLogModule],
  controllers: [GovernanceController],
  providers: [
    GovernanceService,
    {
      provide: GOVERNANCE_REPOSITORY,
      inject: [ConfigService, AUDIT_LOG_STORE],
      useFactory: (config: ConfigService, auditLog: AuditLogStore) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        return databaseUrl ? new PostgresGovernanceRepository(databaseUrl) : new InMemoryGovernanceRepository(auditLog);
      }
    }
  ],
  exports: [GovernanceService]
})
export class GovernanceModule {}
