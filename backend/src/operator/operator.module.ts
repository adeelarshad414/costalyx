import { Module } from '@nestjs/common';
import { OperatorReadinessController } from './operator-readiness.controller';
import { OperatorReadinessService } from './operator-readiness.service';

@Module({
  controllers: [OperatorReadinessController],
  providers: [OperatorReadinessService]
})
export class OperatorModule {}
