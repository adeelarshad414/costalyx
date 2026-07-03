import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_LOG_STORE, type AuditLogStore } from '../audit/audit-log.store';
import { AuditLogModule } from '../audit/audit-log.module';
import { CostModelModule } from '../cost-model/cost-model.module';
import { InMemoryOptimizationRepository } from './in-memory-optimization.repository';
import { OPTIMIZATION_REPOSITORY } from './optimization.repository';
import { OptimizationController } from './optimization.controller';
import { OptimizationService } from './optimization.service';
import { PostgresOptimizationRepository } from './postgres-optimization.repository';

@Module({
  imports: [AuditLogModule, CostModelModule],
  controllers: [OptimizationController],
  providers: [
    OptimizationService,
    {
      provide: OPTIMIZATION_REPOSITORY,
      inject: [ConfigService, AUDIT_LOG_STORE],
      useFactory: (config: ConfigService, auditLog: AuditLogStore) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        return databaseUrl ? new PostgresOptimizationRepository(databaseUrl) : new InMemoryOptimizationRepository(auditLog);
      }
    }
  ],
  exports: [OptimizationService]
})
export class OptimizationModule {}
