import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../security/token-verifier';
import { ALLOCATION_REPOSITORY, type AllocationRepository } from './allocation.repository';
import type { CreateDimensionDto, CreateDimensionMappingDto } from './dto/dimension.dto';
import type { ListResourceTagsQueryDto, UpsertResourceTagDto } from './dto/resource-tag.dto';
import type { PageQuery } from '../governance/governance.types';

@Injectable()
export class AllocationService {
  constructor(@Inject(ALLOCATION_REPOSITORY) private readonly repository: AllocationRepository) {}

  listDimensions(query: PageQuery, actor: AuthenticatedUser) {
    return this.repository.listDimensions(query, actor);
  }

  createDimension(input: CreateDimensionDto, actor: AuthenticatedUser, idempotencyKey: string) {
    return this.repository.createDimension(input, actor, idempotencyKey);
  }

  createDimensionMapping(
    dimensionId: string,
    input: CreateDimensionMappingDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ) {
    return this.repository.createDimensionMapping(dimensionId, input, actor, idempotencyKey);
  }

  listResourceTags(query: ListResourceTagsQueryDto, actor: AuthenticatedUser) {
    return this.repository.listResourceTags(query, actor);
  }

  upsertResourceTag(input: UpsertResourceTagDto, actor: AuthenticatedUser, idempotencyKey: string) {
    return this.repository.upsertResourceTag(input, actor, idempotencyKey);
  }
}
