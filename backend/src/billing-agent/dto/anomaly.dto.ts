import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PageQueryDto } from '../../governance/dto/page-query.dto';
import type { AnomalyStatus, AnomalyType, FalsePositiveReason } from '../billing-agent.types';

export const anomalyTypes: AnomalyType[] = ['unit_price', 'usage', 'new_spend', 'coverage'];
export const anomalyStatuses: AnomalyStatus[] = ['open', 'acknowledged', 'resolved', 'false_positive'];
export const falsePositiveReasons: FalsePositiveReason[] = ['seasonal', 'planned_change', 'known_migration', 'other'];

export class ListAnomaliesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(anomalyTypes)
  type?: AnomalyType;

  @IsOptional()
  @IsIn(anomalyStatuses)
  status?: AnomalyStatus;
}

export class UpdateAnomalyStatusDto {
  @IsIn(anomalyStatuses)
  status!: AnomalyStatus;

  @IsOptional()
  @IsIn(falsePositiveReasons)
  falsePositiveReason?: FalsePositiveReason;

  @IsOptional()
  @IsString()
  @MinLength(1)
  falsePositiveNote?: string;
}
