import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PageQueryDto } from '../../governance/dto/page-query.dto';
import type { CloudProvider } from '../../cost-model/cost-record.types';
import type { ReportCategory } from '../reporting.types';

const categories: ReportCategory[] = ['cost', 'cost_summary', 'invoices', 'utilization', 'underutilization'];
const providers: CloudProvider[] = ['aws', 'azure', 'gcp'];

export class ReportListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(categories)
  category?: ReportCategory;
}

export class ReportRunQueryDto {
  @IsOptional()
  @IsIn(providers)
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
}
