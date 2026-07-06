import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';

const providers = ['aws', 'azure', 'gcp'] as const;

export class CreateCloudCredentialDto {
  @IsIn(providers)
  provider!: (typeof providers)[number];

  @IsUUID('4')
  accountId!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(1)
  vaultPath!: string;
}

export class RotateCloudCredentialDto {
  @IsString()
  @MinLength(1)
  vaultPath!: string;
}
