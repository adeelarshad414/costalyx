import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AllocationModule } from './allocation/allocation.module';
import { BillingAgentModule } from './billing-agent/billing-agent.module';
import { CostModelModule } from './cost-model/cost-model.module';
import { ExecutiveModule } from './executive/executive.module';
import { GovernanceModule } from './governance/governance.module';
import { HealthController } from './health.controller';
import { IngestionModule } from './ingestion/ingestion.module';
import { OptimizationModule } from './optimization/optimization.module';
import { OperatorModule } from './operator/operator.module';
import { ReportingModule } from './reporting/reporting.module';
import { createRateLimitMiddleware } from './common/rate-limit.middleware';
import { OidcTokenVerifier } from './security/oidc-token-verifier';
import { RolesGuard } from './security/roles.guard';
import { AUTH_TOKEN_VERIFIER } from './security/token-verifier';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AllocationModule,
    CostModelModule,
    IngestionModule,
    GovernanceModule,
    OptimizationModule,
    OperatorModule,
    ExecutiveModule,
    ReportingModule,
    BillingAgentModule
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: AUTH_TOKEN_VERIFIER,
      useClass: OidcTokenVerifier
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(createRateLimitMiddleware()).forRoutes('*');
  }
}
