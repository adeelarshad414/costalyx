import { IsObject, IsOptional, Matches } from 'class-validator';
import type { ExecutiveSummaryQuery } from '../executive.types';

const moneyPattern = /^[0-9]+(\.[0-9]{1,8})?$/;

export class ExecutiveSummaryQueryDto implements ExecutiveSummaryQuery {
  @IsOptional()
  @Matches(moneyPattern)
  revenueBaselineUsd?: string;

  @IsOptional()
  @Matches(moneyPattern)
  budgetBaselineUsd?: string;
}

export class TcoEstimateDto {
  @IsObject()
  workloadSpec!: Record<string, unknown>;
}
