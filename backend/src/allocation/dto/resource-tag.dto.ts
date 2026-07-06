import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import type { ResourceTagSource } from '../allocation.types';

export class UpsertResourceTagDto {
  @IsString()
  @MinLength(1)
  resourceId!: string;

  @IsString()
  @MinLength(1)
  tagKey!: string;

  @IsString()
  @MinLength(1)
  tagValue!: string;

  @IsIn(['native', 'manual', 'inferred'])
  source!: ResourceTagSource;
}

export class ListResourceTagsQueryDto {
  @IsString()
  @MinLength(1)
  resourceId!: string;

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
