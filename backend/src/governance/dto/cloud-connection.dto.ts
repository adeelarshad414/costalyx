import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import type { CloudProvider } from '../../cost-model/cost-record.types';
import type { CloudConnection } from '../governance.types';

const providers: CloudProvider[] = ['aws', 'azure', 'gcp'];
const accessModes: CloudConnection['accessMode'][] = [
  'aws_assume_role',
  'azure_delegated_app',
  'gcp_workload_identity'
];

export class CreateCloudConnectionDto {
  @IsEnum(providers)
  provider!: CloudProvider;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(1)
  externalTenantId!: string;

  @IsEnum(accessModes)
  accessMode!: CloudConnection['accessMode'];

  @IsString()
  @MinLength(1)
  readOnlyPrincipal!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  billingExportUri?: string;
}

export function validateCloudConnectionShape(input: CreateCloudConnectionDto): boolean {
  if (input.provider === 'aws') {
    return input.accessMode === 'aws_assume_role' && /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(input.readOnlyPrincipal);
  }
  if (input.provider === 'azure') {
    return input.accessMode === 'azure_delegated_app' && /^[0-9a-f-]{36}$/i.test(input.readOnlyPrincipal);
  }
  return input.accessMode === 'gcp_workload_identity' && /^projects\/\d+\/locations\/global\/workloadIdentityPools\//.test(
    input.readOnlyPrincipal
  );
}
