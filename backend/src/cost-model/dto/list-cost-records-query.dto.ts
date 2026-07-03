import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { CloudProvider } from '../cost-record.types';

export class ListCostRecordsQueryDto {
  @IsOptional()
  @IsEnum(['aws', 'azure', 'gcp'])
  provider?: CloudProvider;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  dimension?: string;

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
