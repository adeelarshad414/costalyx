import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InMemoryAuditLogStore, type AuditLogStore } from '../audit/audit-log.store';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { UpdateRecommendationDto } from './dto/recommendation.dto';
import type { OptimizationRepository } from './optimization.repository';
import type {
  RealizedSaving,
  RealizedSavingsQuery,
  Recommendation,
  RecommendationCandidate,
  RecommendationQuery
} from './optimization.types';

@Injectable()
export class InMemoryOptimizationRepository implements OptimizationRepository {
  private readonly recommendations = new Map<string, Recommendation>();
  private readonly realizations = new Map<string, Omit<RealizedSaving, 'id' | 'tenantId' | 'recommendationId' | 'appliedAt'>>();
  private readonly savings = new Map<string, RealizedSaving>();
  private readonly idempotentResponses = new Map<string, Recommendation>();

  constructor(private readonly auditLog: AuditLogStore = new InMemoryAuditLogStore()) {}

  async syncRecommendations(tenantId: string, candidates: RecommendationCandidate[]): Promise<void> {
    candidates.forEach((candidate) => {
      const scopedRecommendation = { ...candidate.recommendation, tenantId };
      const existing = this.recommendations.get(scopedRecommendation.id);
      if (!existing) {
        this.recommendations.set(scopedRecommendation.id, scopedRecommendation);
      } else if (existing.status === 'open') {
        this.recommendations.set(scopedRecommendation.id, {
          ...scopedRecommendation,
          status: existing.status
        });
      }
      this.realizations.set(scopedRecommendation.id, candidate.realization);
    });
  }

  async listRecommendations(query: RecommendationQuery) {
    const items = [...this.recommendations.values()]
      .filter((recommendation) => recommendation.tenantId === query.tenantId)
      .filter((recommendation) => !query.status || recommendation.status === query.status)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    return paginate(items, query);
  }

  async updateRecommendation(
    id: string,
    input: UpdateRecommendationDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<Recommendation> {
    const scopedKey = `${actor.tenantId}:${idempotencyKey}`;
    const existingReplay = this.idempotentResponses.get(scopedKey);
    if (existingReplay) {
      return existingReplay;
    }
    const recommendation = this.recommendations.get(id);
    if (!recommendation || recommendation.tenantId !== actor.tenantId) {
      throw new NotFoundException(`Recommendation ${id} was not found.`);
    }
    const updated = { ...recommendation, status: input.status };
    this.recommendations.set(id, updated);
    if (input.status === 'applied') {
      await this.createRealizedSaving(id, actor);
    }
    this.idempotentResponses.set(scopedKey, updated);
    return updated;
  }

  async listRealizedSavings(query: RealizedSavingsQuery) {
    const items = [...this.savings.values()]
      .filter((saving) => saving.tenantId === query.tenantId)
      .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt) || left.id.localeCompare(right.id));
    return paginate(items, query);
  }

  private async createRealizedSaving(id: string, actor: AuthenticatedUser): Promise<void> {
    if (this.savings.has(id)) {
      return;
    }
    const realization = this.realizations.get(id);
    if (!realization || Number(realization.deltaUsd) <= 0) {
      throw new BadRequestException('Recommendation cannot be applied until ingested billing verifies a positive delta.');
    }
    const saving: RealizedSaving = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      recommendationId: id,
      appliedAt: new Date().toISOString(),
      ...realization
    };
    this.savings.set(id, saving);
    await this.auditLog.append(actor, 'recommendation_applied', 'recommendation', id);
  }
}

function paginate<T>(items: T[], query: { page: number; pageSize: number }) {
  const start = (query.page - 1) * query.pageSize;
  return {
    data: items.slice(start, start + query.pageSize),
    meta: { total: items.length, page: query.page, pageSize: query.pageSize }
  };
}
