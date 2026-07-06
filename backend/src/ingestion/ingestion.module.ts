import { Module } from '@nestjs/common';
import { CostModelModule } from '../cost-model/cost-model.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [CostModelModule],
  controllers: [IngestionController],
  providers: [IngestionService]
})
export class IngestionModule {}
