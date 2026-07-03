import { Injectable, NotFoundException } from '@nestjs/common';
import type { AllocationRepository } from '../allocation/allocation.repository';
import type { CostModelRepository } from './cost-model.repository';
import type { CloudProvider, IngestionBatch, NormalizedCostRecord } from './cost-record.types';
import { stableId } from './stable-id';

@Injectable()
export class InMemoryCostModelRepository implements CostModelRepository {
  private readonly batches = new Map<string, IngestionBatch>();
  private readonly idempotencyResponses = new Map<string, IngestionBatch>();
  private readonly recordsByFingerprint = new Map<string, NormalizedCostRecord>();

  constructor(private readonly allocation?: Pick<AllocationRepository, 'summarizeDimensionMatches'>) {}

  async saveIngestion(input: {
    provider: CloudProvider;
    sourceUri: string;
    idempotencyKey: string;
    rows: NormalizedCostRecord[];
  }): Promise<IngestionBatch> {
    const existing = this.idempotencyResponses.get(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const batch: IngestionBatch = {
      id: stableId(`batch:${input.provider}:${input.sourceUri}:${input.idempotencyKey}`),
      provider: input.provider,
      status: 'complete',
      sourceUri: input.sourceUri,
      createdAt: now,
      completedAt: now,
      ingestedRows: 0,
      duplicateRows: 0
    };

    input.rows.forEach((row) => {
      const storedRow = { ...row, sourceBatchId: batch.id, ingestedAt: now };
      if (this.recordsByFingerprint.has(storedRow.fingerprint)) {
        batch.duplicateRows += 1;
        return;
      }
      this.recordsByFingerprint.set(storedRow.fingerprint, storedRow);
      batch.ingestedRows += 1;
    });

    this.batches.set(batch.id, batch);
    this.idempotencyResponses.set(input.idempotencyKey, batch);
    return batch;
  }

  async getBatch(id: string): Promise<IngestionBatch> {
    const batch = this.batches.get(id);
    if (!batch) {
      throw new NotFoundException(`Ingestion batch ${id} was not found.`);
    }
    return batch;
  }

  async listRecords(query: {
    provider?: CloudProvider;
    accountId?: string;
    service?: string;
    dimension?: string;
    page: number;
    pageSize: number;
  }) {
    let allRows = [...this.recordsByFingerprint.values()].filter((row) => {
      return (
        (!query.provider || row.provider === query.provider) &&
        (!query.accountId || row.accountId === query.accountId) &&
        (!query.service || row.serviceName === query.service)
      );
    });
    if (query.dimension && this.allocation) {
      const matchSummary = await this.allocation.summarizeDimensionMatches(
        query.dimension,
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

  async getSummary(query: { provider?: CloudProvider; accountId?: string; service?: string; dimension?: string } = {}) {
    let rows = [...this.recordsByFingerprint.values()].filter((row) => {
      return (
        (!query.provider || row.provider === query.provider) &&
        (!query.accountId || row.accountId === query.accountId) &&
        (!query.service || row.serviceName === query.service)
      );
    });
    let untaggedCount = rows.length;
    if (query.dimension && this.allocation) {
      const filteredResourceIds = new Set(rows.map((row) => row.resourceId));
      const matchSummary = await this.allocation.summarizeDimensionMatches(
        query.dimension,
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
}
