import type { AuthenticatedUser } from '../security/token-verifier';
import type { UpdateRecommendationDto } from './dto/recommendation.dto';
import type {
  PaginatedRealizedSavings,
  PaginatedRecommendations,
  RealizedSavingsQuery,
  Recommendation,
  RecommendationCandidate,
  RecommendationQuery
} from './optimization.types';

export const OPTIMIZATION_REPOSITORY = Symbol('OPTIMIZATION_REPOSITORY');

export interface OptimizationRepository {
  syncRecommendations(tenantId: string, candidates: RecommendationCandidate[]): Promise<void>;
  listRecommendations(query: RecommendationQuery): Promise<PaginatedRecommendations>;
  updateRecommendation(
    id: string,
    input: UpdateRecommendationDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ): Promise<Recommendation>;
  listRealizedSavings(query: RealizedSavingsQuery): Promise<PaginatedRealizedSavings>;
}
