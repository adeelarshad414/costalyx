import { Module } from '@nestjs/common';
import { CostModelModule } from '../cost-model/cost-model.module';
import { ExecutiveController } from './executive.controller';
import { ExecutiveService } from './executive.service';

@Module({
  imports: [CostModelModule],
  controllers: [ExecutiveController],
  providers: [ExecutiveService],
  exports: [ExecutiveService]
})
export class ExecutiveModule {}
