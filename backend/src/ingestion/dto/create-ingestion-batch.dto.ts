import { IsEnum, IsString, MinLength } from 'class-validator';
import type { CloudProvider } from '../../cost-model/cost-record.types';

export class CreateIngestionBatchDto {
  @IsEnum(['aws', 'azure', 'gcp'])
  provider!: CloudProvider;

  @IsString()
  @MinLength(1)
  sourceUri!: string;
}
