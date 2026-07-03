import { IsArray, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type { Role } from '../../security/roles';

const roles: Role[] = ['viewer', 'analyst', 'admin'];

export class CreateViewDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsObject()
  filterJson!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsIn(roles, { each: true })
  sharedRoleScope?: Role[];
}
