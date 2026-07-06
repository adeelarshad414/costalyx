import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import type { CloudProvider, CostExplorerDimension } from '../cost-record.types';

const costExplorerDimensions: CostExplorerDimension[] = [
  'provider',
  'account',
  'service',
  'leaseType',
  'transactionType',
  'usageFamily'
];

export class ListCostRecordsQueryDto {
  @IsOptional()
  @IsEnum(['aws', 'azure', 'gcp'])
  provider?: CloudProvider;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  accountGroupId?: string;

  @IsOptional()
  @IsString()
  cloudConnectionId?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  dimension?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 25;
}

export class CostExplorerFlowQueryDto {
  @IsOptional()
  @IsEnum(['aws', 'azure', 'gcp'])
  provider?: CloudProvider;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  accountGroupId?: string;

  @IsOptional()
  @IsString()
  cloudConnectionId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => String(entry).split(',')).filter(Boolean);
    }
    return String(value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  })
  @IsIn(costExplorerDimensions, { each: true })
  dimensions?: CostExplorerDimension[];

  @IsOptional()
  @Matches(/^[0-9]+(\.[0-9]{1,8})?$/)
  costFloorUsd?: string;
}
