import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { Role } from '../../security/roles';

const roles = ['viewer', 'analyst', 'admin'] as const;

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(roles, { each: true })
  roles!: Role[];
}

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  permissionBitset?: string;
}
