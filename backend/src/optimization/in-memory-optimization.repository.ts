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
  private readonly realizations = new Map<string, Omit<RealizedSaving, 'id' | 'recommendationId' | 'appliedAt'>>();
  private readonly savings = new Map<string, RealizedSaving>();
  private readonly idempotentResponses = new Map<string, Recommendation>();

  constructor(private readonly auditLog: AuditLogStore = new InMemoryAuditLogStore()) {}

  async syncRecommendations(candidates: RecommendationCandidate[]): Promise<void> {
    candidates.forEach((candidate) => {
      const existing = this.recommendations.get(candidate.recommendation.id);
      if (!existing) {
        this.recommendations.set(candidate.recommendation.id, candidate.recommendation);
      } else if (existing.status === 'open') {
        this.recommendations.set(candidate.recommendation.id, {
          ...candidate.recommendation,
          status: existing.status
        });
      }
      this.realizations.set(candidate.recommendation.id, candidate.realization);
    });
  }

  async listRecommendations(query: RecommendationQuery) {
    const items = [...this.recommendations.values()]
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
    const existingReplay = this.idempotentResponses.get(idempotencyKey);
    if (existingReplay) {
      return existingReplay;
    }
    const recommendation = this.recommendations.get(id);
    if (!recommendation) {
      throw new NotFoundException(`Recommendation ${id} was not found.`);
    }
    const updated = { ...recommendation, status: input.status };
    this.recommendations.set(id, updated);
    if (input.status === 'applied') {
      await this.createRealizedSaving(id, actor);
    }
    this.idempotentResponses.set(idempotencyKey, updated);
    return updated;
  }

  async listRealizedSavings(query: RealizedSavingsQuery) {
    const items = [...this.savings.values()].sort(
      (left, right) => right.appliedAt.localeCompare(left.appliedAt) || left.id.localeCompare(right.id)
    );
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
