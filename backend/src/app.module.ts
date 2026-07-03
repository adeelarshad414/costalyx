import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CostModelModule } from './cost-model/cost-model.module';
import { HealthController } from './health.controller';
import { IngestionModule } from './ingestion/ingestion.module';
import { RolesGuard } from './security/roles.guard';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CostModelModule, IngestionModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ]
})
export class AppModule {}
