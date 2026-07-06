import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_LOG_STORE, type AuditLogStore } from '../audit/audit-log.store';
import { AuditLogModule } from '../audit/audit-log.module';
import { AllocationController } from './allocation.controller';
import { ALLOCATION_REPOSITORY } from './allocation.repository';
import { AllocationService } from './allocation.service';
import { InMemoryAllocationRepository } from './in-memory-allocation.repository';
import { PostgresAllocationRepository } from './postgres-allocation.repository';

@Module({
  imports: [AuditLogModule],
  controllers: [AllocationController],
  providers: [
    AllocationService,
    {
      provide: ALLOCATION_REPOSITORY,
      inject: [ConfigService, AUDIT_LOG_STORE],
      useFactory: (config: ConfigService, auditLog: AuditLogStore) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        return databaseUrl ? new PostgresAllocationRepository(databaseUrl) : new InMemoryAllocationRepository(auditLog);
      }
    }
  ],
  exports: [AllocationService, ALLOCATION_REPOSITORY]
})
export class AllocationModule {}
