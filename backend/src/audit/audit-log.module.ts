import { Global, Module } from '@nestjs/common';
import { AUDIT_LOG_STORE, InMemoryAuditLogStore } from './audit-log.store';

@Global()
@Module({
  providers: [
    {
      provide: AUDIT_LOG_STORE,
      useClass: InMemoryAuditLogStore
    }
  ],
  exports: [AUDIT_LOG_STORE]
})
export class AuditLogModule {}
