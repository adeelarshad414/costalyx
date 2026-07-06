import { Injectable, NotFoundException } from '@nestjs/common';
import type { AllocationRepository } from '../allocation/allocation.repository';
import { buildCostExplorerFlow } from './cost-explorer-flow';
import type { CostModelRepository } from './cost-model.repository';
import type {
  CloudProvider,
  CostExplorerDimension,
  IngestionBatch,
  NormalizedCostRecord
} from './cost-record.types';
import { stableId } from './stable-id';

type StoredCostRecord = NormalizedCostRecord & {
  tenantId: string;
  cloudConnectionId: string | null;
};

@Injectable()
export class InMemoryCostModelRepository implements CostModelRepository {
  private readonly batches = new Map<string, IngestionBatch>();
  private readonly idempotencyResponses = new Map<string, IngestionBatch>();
  private readonly recordsByFingerprint = new Map<string, StoredCostRecord>();

  constructor(private readonly allocation?: Pick<AllocationRepository, 'summarizeDimensionMatches'>) {}

  async saveIngestion(input: {
    tenantId: string;
    provider: CloudProvider;
    cloudConnectionId?: string;
    sourceUri: string;
    idempotencyKey: string;
    rows: NormalizedCostRecord[];
  }): Promise<IngestionBatch> {
    const scopedKey = `${input.tenantId}:${input.idempotencyKey}`;
    const existing = this.idempotencyResponses.get(scopedKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const batch: IngestionBatch = {
      id: stableId(`batch:${input.tenantId}:${input.provider}:${input.sourceUri}:${input.idempotencyKey}`),
      tenantId: input.tenantId,
      provider: input.provider,
      status: 'complete',
      cloudConnectionId: input.cloudConnectionId ?? null,
      sourceUri: input.sourceUri,
      createdAt: now,
      completedAt: now,
      ingestedRows: 0,
      duplicateRows: 0
    };

    input.rows.forEach((row) => {
      const storedRow = {
        ...row,
        tenantId: input.tenantId,
        cloudConnectionId: input.cloudConnectionId ?? null,
        sourceBatchId: batch.id,
        ingestedAt: now
      };
      const fingerprintKey = `${input.tenantId}:${storedRow.fingerprint}`;
      if (this.recordsByFingerprint.has(fingerprintKey)) {
        batch.duplicateRows += 1;
        return;
      }
      this.recordsByFingerprint.set(fingerprintKey, storedRow);
      batch.ingestedRows += 1;
    });

    this.batches.set(batch.id, batch);
    this.idempotencyResponses.set(scopedKey, batch);
    return batch;
  }

  async getBatch(id: string, tenantId: string): Promise<IngestionBatch> {
    const batch = this.batches.get(id);
    if (!batch || batch.tenantId !== tenantId) {
      throw new NotFoundException(`Ingestion batch ${id} was not found.`);
    }
    return batch;
  }

  async listRecords(query: {
    tenantId: string;
    provider?: CloudProvider;
    accountId?: string;
    accountGroupId?: string;
    cloudConnectionId?: string;
    service?: string;
    dimension?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }) {
    let allRows = this.filterRows(query);
    if (query.dimension && this.allocation) {
      const matchSummary = await this.allocation.summarizeDimensionMatches(
        query.dimension,
        query.tenantId,
        allRows.map((row) => row.resourceId)
      );
      allRows = allRows.filter((row) => matchSummary.matchingResourceIds.has(row.resourceId));
    }
    const start = (query.page - 1) * query.pageSize;
    return {
      data: allRows.slice(start, start + query.pageSize),
      meta: { total: allRows.length, page: query.page, pageSize: query.pageSize }
    };
  }

  async getSummary(
    query: {
      tenantId: string;
      provider?: CloudProvider;
      accountId?: string;
      accountGroupId?: string;
      cloudConnectionId?: string;
      service?: string;
      dimension?: string;
      from?: string;
      to?: string;
    }
  ) {
    let rows = this.filterRows(query);
    let untaggedCount = rows.length;
    if (query.dimension && this.allocation) {
      const filteredResourceIds = new Set(rows.map((row) => row.resourceId));
      const matchSummary = await this.allocation.summarizeDimensionMatches(
        query.dimension,
        query.tenantId,
        rows.map((row) => row.resourceId)
      );
      rows = rows.filter((row) => matchSummary.matchingResourceIds.has(row.resourceId));
      untaggedCount = filteredResourceIds.size - matchSummary.matchingResourceIds.size;
    }
    const totalCost = rows.reduce((sum, row) => sum + Number(row.costTotalUsd), 0);
    return {
      totalCostUsd: totalCost.toFixed(8),
      resourceCount: new Set(rows.map((row) => row.resourceId)).size,
      untaggedCount,
      inactiveCount: 0,
      isEstimate: rows.some((row) => row.isEstimate)
    };
  }

  async getExplorerFlow(
    query: {
      tenantId: string;
      provider?: CloudProvider;
      accountId?: string;
      accountGroupId?: string;
      cloudConnectionId?: string;
      service?: string;
      dimension?: string;
      from?: string;
      to?: string;
      dimensions?: CostExplorerDimension[];
      costFloorUsd?: string;
    }
  ) {
    return buildCostExplorerFlow({
      records: this.filterRows(query),
      dimensions: query.dimensions,
      costFloorUsd: query.costFloorUsd
    });
  }

  private filterRows(query: {
    tenantId: string;
    provider?: CloudProvider;
    accountId?: string;
    cloudConnectionId?: string;
    service?: string;
    from?: string;
    to?: string;
  }) {
    return [...this.recordsByFingerprint.values()].filter((row) => {
      return (
        row.tenantId === query.tenantId &&
        (!query.provider || row.provider === query.provider) &&
        (!query.accountId || row.accountId === query.accountId) &&
        (!query.cloudConnectionId || row.cloudConnectionId === query.cloudConnectionId) &&
        (!query.service || row.serviceName === query.service) &&
        withinDateRange(row, query)
      );
    });
  }
}

function withinDateRange(row: NormalizedCostRecord, query: { from?: string; to?: string }): boolean {
  const startsAt = new Date(row.validFrom).getTime();
  return (!query.from || startsAt >= new Date(query.from).getTime()) && (!query.to || startsAt <= new Date(query.to).getTime());
}
