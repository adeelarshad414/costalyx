import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CostModelModule } from './cost-model/cost-model.module';
import { GovernanceModule } from './governance/governance.module';
import { HealthController } from './health.controller';
import { IngestionModule } from './ingestion/ingestion.module';
import { OidcTokenVerifier } from './security/oidc-token-verifier';
import { RolesGuard } from './security/roles.guard';
import { AUTH_TOKEN_VERIFIER } from './security/token-verifier';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CostModelModule, IngestionModule, GovernanceModule],
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
export class AppModule {}
