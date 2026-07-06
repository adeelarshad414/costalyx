import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';
import { CreateAccountDto, CreateAccountGroupDto, PatchAccountGroupDto } from './dto/account.dto';
import { CreateCloudCredentialDto, RotateCloudCredentialDto } from './dto/cloud-credential.dto';
import { PageQueryDto } from './dto/page-query.dto';
import { CreateRoleDto, CreateUserDto } from './dto/user.dto';
import { CreateViewDto } from './dto/view.dto';
import { GovernanceService } from './governance.service';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@Controller('api/v1')
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('accounts')
  @RequiredRole('viewer')
  listAccounts(@Query() query: PageQueryDto) {
    return this.governance.listAccounts(query);
  }

  @Post('accounts')
  @RequiredRole('admin')
  createAccount(
    @Body() body: CreateAccountDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.governance.createAccount(body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('account-groups')
  @RequiredRole('viewer')
  listAccountGroups(@Query() query: PageQueryDto) {
    return this.governance.listAccountGroups(query);
  }

  @Post('account-groups')
  @RequiredRole('admin')
  createAccountGroup(
    @Body() body: CreateAccountGroupDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.governance.createAccountGroup(body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Patch('account-groups/:id')
  @RequiredRole('admin')
  updateAccountGroup(
    @Param('id') id: string,
    @Body() body: PatchAccountGroupDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.governance.updateAccountGroup(id, body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Delete('account-groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredRole('admin')
  deleteAccountGroup(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    this.governance.deleteAccountGroup(id, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('cloud-credentials')
  @RequiredRole('admin')
  listCredentials(@Query() query: PageQueryDto) {
    return this.governance.listCredentials(query);
  }

  @Post('cloud-credentials')
  @RequiredRole('admin')
  createCredential(
    @Body() body: CreateCloudCredentialDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.governance.createCredential(body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Patch('cloud-credentials/:id/rotation')
  @RequiredRole('admin')
  rotateCredential(
    @Param('id') id: string,
    @Body() body: RotateCloudCredentialDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.governance.rotateCredential(id, body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('users')
  @RequiredRole('admin')
  listUsers(@Query() query: PageQueryDto) {
    return this.governance.listUsers(query);
  }

  @Post('users')
  @RequiredRole('admin')
  createUser(
    @Body() body: CreateUserDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.governance.createUser(body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('roles')
  @RequiredRole('admin')
  listRoles() {
    return this.governance.listRoles();
  }

  @Post('roles')
  @RequiredRole('admin')
  createRole(@Body() _body: CreateRoleDto) {
    return this.governance.rejectCustomRoleCreation();
  }

  @Get('audit-log')
  @RequiredRole('admin')
  listAuditLog(@Query() query: PageQueryDto) {
    return this.governance.listAuditLog(query);
  }

  @Get('views')
  @RequiredRole('viewer')
  listViews(@Query() query: PageQueryDto, @Req() request: AuthenticatedRequest) {
    return this.governance.listViews(query, request.user);
  }

  @Post('views')
  @RequiredRole('analyst')
  createView(
    @Body() body: CreateViewDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.governance.createView(body, request.user, requireIdempotencyKey(idempotencyKey));
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value) {
    throw new BadRequestException('Idempotency-Key header is required.');
  }
  return value;
}
