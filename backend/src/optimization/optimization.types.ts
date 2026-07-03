import type { PageQuery, Paginated } from '../governance/governance.types';

export type RecommendationType = 'rightsizing' | 'ri_purchase' | 'idle' | 'commitment_gap';
export type RecommendationStatus = 'open' | 'applied' | 'dismissed';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  resourceId: string;
  estimatedSavingsUsd: string;
  status: RecommendationStatus;
  createdAt: string;
}

export interface RealizedSaving {
  id: string;
  recommendationId: string;
  appliedAt: string;
  baselineCostUsd: string;
  actualCostUsd: string;
  deltaUsd: string;
  verificationSource: 'ingested_billing';
}

export interface RecommendationCandidate {
  recommendation: Recommendation;
  realization: Omit<RealizedSaving, 'id' | 'recommendationId' | 'appliedAt'>;
}

export interface RecommendationQuery extends PageQuery {
  status?: RecommendationStatus;
}

export type RealizedSavingsQuery = PageQuery;
export type PaginatedRecommendations = Paginated<Recommendation>;
export type PaginatedRealizedSavings = Paginated<RealizedSaving>;
