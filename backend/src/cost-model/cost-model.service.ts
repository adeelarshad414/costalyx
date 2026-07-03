import { Injectable, NotFoundException } from '@nestjs/common';
import type { CloudProvider, IngestionBatch, NormalizedCostRecord } from './cost-record.types';
import { stableId } from './stable-id';

@Injectable()
export class CostModelService {
  private readonly batches = new Map<string, IngestionBatch>();
  private readonly idempotencyResponses = new Map<string, IngestionBatch>();
  private readonly recordsByFingerprint = new Map<string, NormalizedCostRecord>();

  saveIngestion(input: {
    provider: CloudProvider;
    sourceUri: string;
    idempotencyKey: string;
    rows: NormalizedCostRecord[];
  }): IngestionBatch {
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

  getBatch(id: string): IngestionBatch {
    const batch = this.batches.get(id);
    if (!batch) {
      throw new NotFoundException(`Ingestion batch ${id} was not found.`);
    }
    return batch;
  }

  listRecords(query: {
    provider?: CloudProvider;
    accountId?: string;
    service?: string;
    page: number;
    pageSize: number;
  }) {
    const allRows = [...this.recordsByFingerprint.values()].filter((row) => {
      return (
        (!query.provider || row.provider === query.provider) &&
        (!query.accountId || row.accountId === query.accountId) &&
        (!query.service || row.serviceName === query.service)
      );
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      data: allRows.slice(start, start + query.pageSize),
      meta: { total: allRows.length, page: query.page, pageSize: query.pageSize }
    };
  }

  getSummary() {
    const rows = [...this.recordsByFingerprint.values()];
    const totalCost = rows.reduce((sum, row) => sum + Number(row.costTotalUsd), 0);
    return {
      totalCostUsd: totalCost.toFixed(8),
      resourceCount: new Set(rows.map((row) => row.resourceId)).size,
      untaggedCount: rows.length,
      inactiveCount: 0,
      isEstimate: rows.some((row) => row.isEstimate)
    };
  }
}
