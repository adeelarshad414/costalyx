import { Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { stableId } from '../cost-model/stable-id';
import type { PageQuery, Paginated } from '../governance/governance.types';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { AllocationRepository } from './allocation.repository';
import type { Dimension, DimensionMapping, DimensionMatchSummary, ResourceTag, ResourceTagSource } from './allocation.types';
import type { CreateDimensionDto, CreateDimensionMappingDto } from './dto/dimension.dto';
import type { ListResourceTagsQueryDto, UpsertResourceTagDto } from './dto/resource-tag.dto';

type PgPool = Pick<Pool, 'connect' | 'query'> & Partial<Pick<Pool, 'end'>>;
type PgRow = Record<string, unknown>;

const defaultOrgId = stableId('org:default');

@Injectable()
export class PostgresAllocationRepository implements AllocationRepository, OnModuleDestroy {
  private readonly pool: PgPool;
  private readonly ownsPool: boolean;

  constructor(poolOrConnectionString: PgPool | string) {
    if (typeof poolOrConnectionString === 'string') {
      this.ownsPool = true;
      this.pool = new Pool({ connectionString: poolOrConnectionString });
    } else {
      this.ownsPool = false;
      this.pool = poolOrConnectionString;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ownsPool && this.pool.end) {
      await this.pool.end();
    }
  }

  async listDimensions(query: PageQuery): Promise<Paginated<Dimension>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT id, org_id, name, created_by, created_at
       FROM dimensions
       ORDER BY created_at ASC, id ASC
       LIMIT $1 OFFSET $2`,
      [query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(id)::int AS total FROM dimensions');
    return {
      data: result.rows.map((row) => mapDimension(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async createDimension(
    input: CreateDimensionDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<Dimension> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, idempotencyKey, async () => {
        const actorId = stableId(`actor:${actor.subject}`);
        const saved = await client.query(
          `INSERT INTO dimensions (id, org_id, name, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, org_id, name, created_by, created_at`,
          [randomUUID(), defaultOrgId, input.name, actorId, new Date().toISOString()]
        );
        const dimension = mapDimension(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'dimension_created', 'dimension', dimension.id);
        return dimension;
      })
    );
  }

  async createDimensionMapping(
    dimensionId: string,
    input: CreateDimensionMappingDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<DimensionMapping> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, idempotencyKey, async () => {
        const existingDimension = await client.query('SELECT id FROM dimensions WHERE id = $1', [dimensionId]);
        if (!existingDimension.rows[0]) {
          throw new NotFoundException(`Dimension ${dimensionId} was not found.`);
        }
        const saved = await client.query(
          `INSERT INTO dimension_tag_mappings (id, dimension_id, tag_key, tag_value_pattern)
           VALUES ($1, $2, $3, $4)
           RETURNING id, dimension_id, tag_key, tag_value_pattern`,
          [randomUUID(), dimensionId, input.tagKey, input.tagValuePattern ?? null]
        );
        const mapping = mapDimensionMapping(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'dimension_mapping_created', 'dimension_mapping', mapping.id);
        return mapping;
      })
    );
  }

  async listResourceTags(query: ListResourceTagsQueryDto): Promise<Paginated<ResourceTag>> {
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query(
      `SELECT resource_id, tag_key, tag_value, source
       FROM resource_tags
       WHERE resource_id = $1
       ORDER BY tag_key ASC
       LIMIT $2 OFFSET $3`,
      [query.resourceId, query.pageSize, offset]
    );
    const total = await this.pool.query('SELECT COUNT(*)::int AS total FROM resource_tags WHERE resource_id = $1', [
      query.resourceId
    ]);
    return {
      data: result.rows.map((row) => mapResourceTag(row as PgRow)),
      meta: { total: Number((total.rows[0] as PgRow | undefined)?.total ?? 0), page: query.page, pageSize: query.pageSize }
    };
  }

  async upsertResourceTag(
    input: UpsertResourceTagDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<ResourceTag> {
    return this.withTransaction((client) =>
      this.withIdempotency(client, idempotencyKey, async () => {
        const saved = await client.query(
          `INSERT INTO resource_tags (resource_id, tag_key, tag_value, source, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (resource_id, tag_key)
           DO UPDATE SET tag_value = EXCLUDED.tag_value, source = EXCLUDED.source, updated_at = EXCLUDED.updated_at
           RETURNING resource_id, tag_key, tag_value, source`,
          [input.resourceId, input.tagKey, input.tagValue, input.source, new Date().toISOString()]
        );
        const tag = mapResourceTag(saved.rows[0] as PgRow);
        await this.appendAudit(client, actor, 'resource_tag_upserted', 'resource_tag', `${tag.resourceId}:${tag.tagKey}`);
        return tag;
      })
    );
  }

  async summarizeDimensionMatches(dimensionId: string, resourceIds: string[]): Promise<DimensionMatchSummary> {
    if (resourceIds.length === 0) {
      return { matchingResourceIds: new Set(), taggedResourceIds: new Set() };
    }
    const result = await this.pool.query(
      `SELECT
         rt.resource_id,
         bool_or(dtm.id IS NOT NULL) AS matches_dimension
       FROM resource_tags rt
       LEFT JOIN dimension_tag_mappings dtm
         ON dtm.dimension_id = $1
        AND dtm.tag_key = rt.tag_key
        AND (dtm.tag_value_pattern IS NULL OR dtm.tag_value_pattern = rt.tag_value)
       WHERE rt.resource_id = ANY($2::text[])
       GROUP BY rt.resource_id`,
      [dimensionId, resourceIds]
    );
    return {
      matchingResourceIds: new Set(
        result.rows.filter((row) => Boolean((row as PgRow).matches_dimension)).map((row) => String((row as PgRow).resource_id))
      ),
      taggedResourceIds: new Set(result.rows.map((row) => String((row as PgRow).resource_id)))
    };
  }

  private async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async withIdempotency<T>(
    client: PoolClient,
    idempotencyKey: string,
    create: () => Promise<T>
  ): Promise<T> {
    const existing = await client.query('SELECT response_json FROM allocation_idempotency WHERE idempotency_key = $1', [
      idempotencyKey
    ]);
    if (existing.rows[0]) {
      return (existing.rows[0] as PgRow).response_json as T;
    }
    const response = await create();
    await client.query(
      `INSERT INTO allocation_idempotency (idempotency_key, response_json, created_at)
       VALUES ($1, $2, $3)`,
      [idempotencyKey, JSON.stringify(response), new Date().toISOString()]
    );
    return response;
  }

  private async appendAudit(
    client: PoolClient,
    actor: AuthenticatedUser,
    action: string,
    targetType: string,
    targetId: string
  ): Promise<void> {
    const previous = await client.query('SELECT hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1');
    const entryWithoutHash = {
      id: randomUUID(),
      actorId: stableId(`actor:${actor.subject}`),
      action,
      targetType,
      targetId,
      prevHash: (previous.rows[0] as PgRow | undefined)?.hash ? String((previous.rows[0] as PgRow).hash) : null,
      createdAt: new Date().toISOString()
    };
    const hash = createHash('sha256').update(canonicalJson(entryWithoutHash)).digest('hex');
    await client.query(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, prev_hash, hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entryWithoutHash.id,
        entryWithoutHash.actorId,
        action,
        targetType,
        targetId,
        entryWithoutHash.prevHash,
        hash,
        entryWithoutHash.createdAt
      ]
    );
  }
}

function mapDimension(row: PgRow): Dimension {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    createdBy: String(row.created_by),
    createdAt: toIso(row.created_at)
  };
}

function mapDimensionMapping(row: PgRow): DimensionMapping {
  return {
    id: String(row.id),
    dimensionId: String(row.dimension_id),
    tagKey: String(row.tag_key),
    tagValuePattern: row.tag_value_pattern === null || row.tag_value_pattern === undefined ? null : String(row.tag_value_pattern)
  };
}

function mapResourceTag(row: PgRow): ResourceTag {
  return {
    resourceId: String(row.resource_id),
    tagKey: String(row.tag_key),
    tagValue: String(row.tag_value),
    source: row.source as ResourceTagSource
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}
