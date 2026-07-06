import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import type { TenantRecord } from '../governance.types';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/)
  slug?: string;

  @IsOptional()
  @IsIn(['starter', 'business', 'enterprise'])
  plan?: TenantRecord['plan'];
}
