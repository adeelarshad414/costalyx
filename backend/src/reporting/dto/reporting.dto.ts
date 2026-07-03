import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../governance/dto/page-query.dto';
import type { ReportCategory } from '../reporting.types';

const categories: ReportCategory[] = ['cost', 'cost_summary', 'invoices', 'utilization', 'underutilization'];

export class ReportListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(categories)
  category?: ReportCategory;
}

export class ReportRunQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
