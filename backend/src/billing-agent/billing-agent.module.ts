import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_LOG_STORE, type AuditLogStore } from '../audit/audit-log.store';
import { AuditLogModule } from '../audit/audit-log.module';
import { CostModelModule } from '../cost-model/cost-model.module';
import { BillingAgentController } from './billing-agent.controller';
import { InMemoryBillingAgentEventPublisher, BILLING_AGENT_EVENT_PUBLISHER } from './billing-agent-event.publisher';
import { BILLING_AGENT_REPOSITORY } from './billing-agent.repository';
import { BillingAgentService } from './billing-agent.service';
import { InMemoryBillingAgentRepository } from './in-memory-billing-agent.repository';
import { PostgresBillingAgentRepository } from './postgres-billing-agent.repository';

@Module({
  imports: [CostModelModule, AuditLogModule],
  controllers: [BillingAgentController],
  providers: [
    BillingAgentService,
    {
      provide: BILLING_AGENT_REPOSITORY,
      inject: [ConfigService, AUDIT_LOG_STORE],
      useFactory: (config: ConfigService, auditLog: AuditLogStore) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        return databaseUrl ? new PostgresBillingAgentRepository(databaseUrl) : new InMemoryBillingAgentRepository(auditLog);
      }
    },
    {
      provide: BILLING_AGENT_EVENT_PUBLISHER,
      useClass: InMemoryBillingAgentEventPublisher
    }
  ],
  exports: [BillingAgentService]
})
export class BillingAgentModule {}
