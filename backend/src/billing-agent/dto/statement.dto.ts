import { IsEmail, IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { PageQueryDto } from '../../governance/dto/page-query.dto';
import type { BillingScopeType, BillingStatementStatus, StakeholderNotificationChannel } from '../billing-agent.types';

export const billingScopeTypes: BillingScopeType[] = ['account_group', 'dimension', 'view'];
export const billingStatementStatuses: BillingStatementStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'disputed',
  'void'
];
export const stakeholderNotificationChannels: StakeholderNotificationChannel[] = ['email', 'none'];

export class CreateStatementStakeholderDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  roleLabel!: string;

  @IsIn(stakeholderNotificationChannels)
  notificationChannel!: StakeholderNotificationChannel;
}

export class CreateBillingScopeDto {
  @IsUUID('4')
  stakeholderId!: string;

  @IsIn(billingScopeTypes)
  scopeType!: BillingScopeType;

  @IsString()
  @MinLength(1)
  scopeRef!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsObject()
  scopeFilter?: {
    accountIds?: string[];
    accountExternalIds?: string[];
    resourceIds?: string[];
  };
}

export class GenerateStatementsDto {
  @IsString()
  @MinLength(1)
  periodStart!: string;

  @IsString()
  @MinLength(1)
  periodEnd!: string;
}

export class ListStatementsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(billingStatementStatuses)
  status?: BillingStatementStatus;

  @IsOptional()
  @IsUUID('4')
  stakeholderId?: string;
}

export class DisputeStatementDto {
  @IsString()
  @MinLength(1)
  note!: string;
}
