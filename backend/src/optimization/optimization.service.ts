import { Inject, Injectable } from '@nestjs/common';
import { CostModelService } from '../cost-model/cost-model.service';
import type { NormalizedCostRecord } from '../cost-model/cost-record.types';
import { formatDecimal } from '../cost-model/decimal';
import { stableId } from '../cost-model/stable-id';
import type { AuthenticatedUser } from '../security/token-verifier';
import type { UpdateRecommendationDto } from './dto/recommendation.dto';
import { OPTIMIZATION_REPOSITORY, type OptimizationRepository } from './optimization.repository';
import type {
  RealizedSavingsQuery,
  RecommendationCandidate,
  RecommendationQuery,
  RecommendationType
} from './optimization.types';

const monthlyHours = 730;

@Injectable()
export class OptimizationService {
  constructor(
    private readonly costModel: CostModelService,
    @Inject(OPTIMIZATION_REPOSITORY) private readonly repository: OptimizationRepository
  ) {}

  async listRecommendations(query: RecommendationQuery) {
    await this.syncFromBillingData(query.tenantId);
    return this.repository.listRecommendations(query);
  }

  async updateRecommendation(
    id: string,
    input: UpdateRecommendationDto,
    actor: AuthenticatedUser,
    idempotencyKey: string
  ) {
    await this.syncFromBillingData(actor.tenantId);
    return this.repository.updateRecommendation(id, input, actor, idempotencyKey);
  }

  listRealizedSavings(query: RealizedSavingsQuery) {
    return this.repository.listRealizedSavings(query);
  }

  private async syncFromBillingData(tenantId: string): Promise<void> {
    const records = await this.costModel.listRecords({ tenantId, page: 1, pageSize: 200 });
    await this.repository.syncRecommendations(tenantId, records.data.flatMap((record) => candidateFromRecord(tenantId, record)));
  }
}

function candidateFromRecord(tenantId: string, record: NormalizedCostRecord): RecommendationCandidate[] {
  if (record.isEstimate || record.transactionType !== 'usage') {
    return [];
  }
  const baselineCostUsd = formatDecimal(Number(record.hourlyRateUsd) * monthlyHours, 8);
  const actualCostUsd = formatDecimal(record.costTotalUsd, 8);
  const delta = Number(baselineCostUsd) - Number(actualCostUsd);
  if (delta <= 0) {
    return [];
  }
  const deltaUsd = formatDecimal(delta, 8);
  const type = recommendationType(record);
  const id = stableId(`recommendation:${tenantId}:${type}:${record.provider}:${record.resourceId}:${record.validFrom}`);

  return [
    {
      recommendation: {
        id,
        type,
        resourceId: record.resourceId,
        estimatedSavingsUsd: formatDecimal(delta * 0.2, 8),
        status: 'open',
        createdAt: record.validTo ?? record.validFrom
      },
      realization: {
        baselineCostUsd,
        actualCostUsd,
        deltaUsd,
        verificationSource: 'ingested_billing'
      }
    }
  ];
}

function recommendationType(record: NormalizedCostRecord): RecommendationType {
  const usageHours = Number(record.usageHours);
  if (usageHours <= 1) {
    return 'idle';
  }
  if (record.leaseType === 'on_demand' && usageHours >= 700) {
    return 'ri_purchase';
  }
  return 'rightsizing';
}
