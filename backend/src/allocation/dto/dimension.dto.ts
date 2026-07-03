import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDimensionDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class CreateDimensionMappingDto {
  @IsString()
  @MinLength(1)
  tagKey!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  tagValuePattern?: string | null;
}
