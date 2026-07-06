import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InMemoryAuditLogStore, type AuditLogStore } from '../audit/audit-log.store';
import type { PageQuery, Paginated } from '../governance/governance.types';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { AllocationRepository } from './allocation.repository';
import type { Dimension, DimensionMapping, DimensionMatchSummary, ResourceTag } from './allocation.types';
import type { CreateDimensionDto, CreateDimensionMappingDto } from './dto/dimension.dto';
import type { ListResourceTagsQueryDto, UpsertResourceTagDto } from './dto/resource-tag.dto';

@Injectable()
export class InMemoryAllocationRepository implements AllocationRepository {
  private readonly dimensions = new Map<string, Dimension>();
  private readonly mappings = new Map<string, DimensionMapping>();
  private readonly resourceTags = new Map<string, ResourceTag>();
  private readonly idempotentResponses = new Map<string, unknown>();

  constructor(private readonly auditLog: AuditLogStore = new InMemoryAuditLogStore()) {}

  async listDimensions(query: PageQuery, actor: AuthenticatedUser): Promise<Paginated<Dimension>> {
    return paginate(
      [...this.dimensions.values()].filter((dimension) => dimension.orgId === actor.tenantId),
      query
    );
  }

  async createDimension(
    input: CreateDimensionDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<Dimension> {
    return this.withIdempotency(actor.tenantId, idempotencyKey, async () => {
      const dimension: Dimension = {
        id: randomUUID(),
        orgId: actor.tenantId,
        name: input.name,
        createdBy: actor.subject,
        createdAt: new Date().toISOString()
      };
      this.dimensions.set(dimension.id, dimension);
      await this.auditLog.append(actor, 'dimension_created', 'dimension', dimension.id);
      return dimension;
    });
  }

  async createDimensionMapping(
    dimensionId: string,
    input: CreateDimensionMappingDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<DimensionMapping> {
    return this.withIdempotency(actor.tenantId, idempotencyKey, async () => {
      const dimension = this.dimensions.get(dimensionId);
      if (!dimension || dimension.orgId !== actor.tenantId) {
        throw new NotFoundException(`Dimension ${dimensionId} was not found.`);
      }
      const mapping: DimensionMapping = {
        id: randomUUID(),
        dimensionId,
        tagKey: input.tagKey,
        tagValuePattern: input.tagValuePattern ?? null
      };
      this.mappings.set(mapping.id, mapping);
      await this.auditLog.append(actor, 'dimension_mapping_created', 'dimension_mapping', mapping.id);
      return mapping;
    });
  }

  async listResourceTags(query: ListResourceTagsQueryDto, actor: AuthenticatedUser): Promise<Paginated<ResourceTag>> {
    const tags = [...this.resourceTags.values()]
      .filter((tag) => tag.resourceId === resourceTagStorageKey(actor.tenantId, query.resourceId))
      .map((tag) => ({ ...tag, resourceId: query.resourceId }))
      .sort((left, right) => left.tagKey.localeCompare(right.tagKey));
    return paginate(tags, query);
  }

  async upsertResourceTag(
    input: UpsertResourceTagDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<ResourceTag> {
    return this.withIdempotency(actor.tenantId, idempotencyKey, async () => {
      const tag: ResourceTag = {
        resourceId: resourceTagStorageKey(actor.tenantId, input.resourceId),
        tagKey: input.tagKey,
        tagValue: input.tagValue,
        source: input.source
      };
      this.resourceTags.set(resourceTagKey(tag.resourceId, tag.tagKey), tag);
      await this.auditLog.append(actor, 'resource_tag_upserted', 'resource_tag', `${tag.resourceId}:${tag.tagKey}`);
      return { ...tag, resourceId: input.resourceId };
    });
  }

  async summarizeDimensionMatches(dimensionId: string, tenantId: string, resourceIds: string[]): Promise<DimensionMatchSummary> {
    const dimension = this.dimensions.get(dimensionId);
    if (!dimension || dimension.orgId !== tenantId) {
      return { matchingResourceIds: new Set(), taggedResourceIds: new Set() };
    }
    const mappings = [...this.mappings.values()].filter((mapping) => mapping.dimensionId === dimensionId);
    const resourceIdSet = new Set(resourceIds);
    const taggedResourceIds = new Set<string>();
    const matchingResourceIds = new Set<string>();

    for (const tag of this.resourceTags.values()) {
      const resourceId = decodeResourceTagStorageKey(tenantId, tag.resourceId);
      if (!resourceIdSet.has(resourceId)) {
        continue;
      }
      taggedResourceIds.add(resourceId);
      if (mappings.some((mapping) => matchesMapping(tag, mapping))) {
        matchingResourceIds.add(resourceId);
      }
    }

    return { matchingResourceIds, taggedResourceIds };
  }

  private async withIdempotency<T>(tenantId: string, idempotencyKey: string, create: () => Promise<T>): Promise<T> {
    const scopedKey = `${tenantId}:${idempotencyKey}`;
    const existing = this.idempotentResponses.get(scopedKey);
    if (existing) {
      return existing as T;
    }
    const response = await create();
    this.idempotentResponses.set(scopedKey, response);
    return response;
  }
}

function matchesMapping(tag: ResourceTag, mapping: DimensionMapping): boolean {
  return tag.tagKey === mapping.tagKey && (!mapping.tagValuePattern || tag.tagValue === mapping.tagValuePattern);
}

function resourceTagKey(resourceId: string, tagKey: string): string {
  return `${resourceId}\u0000${tagKey}`;
}

function resourceTagStorageKey(tenantId: string, resourceId: string): string {
  return `${tenantId}:${resourceId}`;
}

function decodeResourceTagStorageKey(tenantId: string, resourceId: string): string {
  const prefix = `${tenantId}:`;
  return resourceId.startsWith(prefix) ? resourceId.slice(prefix.length) : resourceId;
}

function paginate<T>(items: T[], query: PageQuery): Paginated<T> {
  const start = (query.page - 1) * query.pageSize;
  return {
    data: items.slice(start, start + query.pageSize),
    meta: { total: items.length, page: query.page, pageSize: query.pageSize }
  };
}
