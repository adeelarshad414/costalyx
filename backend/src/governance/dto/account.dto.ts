import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const providers = ['aws', 'azure', 'gcp'] as const;

export class CreateAccountDto {
  @IsIn(providers)
  provider!: (typeof providers)[number];

  @IsString()
  @MinLength(1)
  externalAccountId!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  vaultCredentialPath?: string;
}

export class CreateAccountGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  accountIds!: string[];
}

export class PatchAccountGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  accountIds?: string[];
}
