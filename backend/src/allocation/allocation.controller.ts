import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { PageQueryDto } from '../governance/dto/page-query.dto';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';
import { AllocationService } from './allocation.service';
import { CreateDimensionDto, CreateDimensionMappingDto } from './dto/dimension.dto';
import { ListResourceTagsQueryDto, UpsertResourceTagDto } from './dto/resource-tag.dto';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@Controller('api/v1')
export class AllocationController {
  constructor(private readonly allocation: AllocationService) {}

  @Get('dimensions')
  @RequiredRole('viewer')
  listDimensions(@Query() query: PageQueryDto, @Req() request: AuthenticatedRequest) {
    return this.allocation.listDimensions(query, request.user);
  }

  @Post('dimensions')
  @RequiredRole('analyst')
  createDimension(
    @Body() body: CreateDimensionDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.allocation.createDimension(body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Post('dimensions/:id/mappings')
  @RequiredRole('analyst')
  createDimensionMapping(
    @Param('id') id: string,
    @Body() body: CreateDimensionMappingDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.allocation.createDimensionMapping(id, body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('resource-tags')
  @RequiredRole('viewer')
  listResourceTags(@Query() query: ListResourceTagsQueryDto, @Req() request: AuthenticatedRequest) {
    return this.allocation.listResourceTags(query, request.user);
  }

  @Post('resource-tags')
  @RequiredRole('analyst')
  upsertResourceTag(
    @Body() body: UpsertResourceTagDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.allocation.upsertResourceTag(body, request.user, requireIdempotencyKey(idempotencyKey));
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value) {
    throw new BadRequestException('Idempotency-Key header is required.');
  }
  return value;
}
