import type { AuthenticatedUser } from '../security/token-verifier';
import type { CreateDimensionDto, CreateDimensionMappingDto } from './dto/dimension.dto';
import type { ListResourceTagsQueryDto, UpsertResourceTagDto } from './dto/resource-tag.dto';
import type { Dimension, DimensionMapping, DimensionMatchSummary, ResourceTag } from './allocation.types';
import type { PageQuery, Paginated } from '../governance/governance.types';

export const ALLOCATION_REPOSITORY = Symbol('ALLOCATION_REPOSITORY');

export interface AllocationRepository {
  listDimensions(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<Dimension>>;
  createDimension(input: CreateDimensionDto, actor: AuthenticatedUser, idempotencyKey: string): Promise<Dimension>;
  createDimensionMapping(
    dimensionId: string,
    input: CreateDimensionMappingDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<DimensionMapping>;
  listResourceTags(query: ListResourceTagsQueryDto, actor: AuthenticatedUser): Promise<Paginated<ResourceTag>>;
  upsertResourceTag(
    input: UpsertResourceTagDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<ResourceTag>;
  summarizeDimensionMatches(dimensionId: string, tenantId: string, resourceIds: string[]): Promise<DimensionMatchSummary>;
}
