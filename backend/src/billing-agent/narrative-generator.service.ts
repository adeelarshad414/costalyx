import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  BillingStatementReconciliation,
  BillingStatementScopeWarning,
  BillingStatementVarianceMover
} from './billing-agent.types';
import { assertValidNumericClaims } from './numeric-claims';

export interface StatementNarrativeInput {
  stakeholderName: string;
  totalUsd: string;
  periodStart: string;
  periodEnd: string;
  openAnomalyCount: number;
  varianceTopMovers: BillingStatementVarianceMover[];
  reconciliation: BillingStatementReconciliation;
  scopeWarnings?: BillingStatementScopeWarning[];
}

export interface NarrativeProvider {
  generateStatementNarrative(input: StatementNarrativeInput): Promise<string>;
}

@Injectable()
export class NarrativeGeneratorService {
  private readonly provider: NarrativeProvider = new DeterministicNarrativeProvider();

  constructor(private readonly config: ConfigService) {}

  async generateStatementNarrative(input: StatementNarrativeInput): Promise<string> {
    const llmEnabled = this.config.get<string>('COSTALYX_LLM_NARRATIVES_ENABLED') === 'enabled';
    const vaultPath = this.config.get<string>('COSTALYX_LLM_PROVIDER_KEY_VAULT_PATH');
    const narrative = llmEnabled && vaultPath ? await this.provider.generateStatementNarrative(input) : deterministicNarrative(input);
    validateStatementNarrative(narrative, input);
    return narrative;
  }
}

class DeterministicNarrativeProvider implements NarrativeProvider {
  async generateStatementNarrative(input: StatementNarrativeInput): Promise<string> {
    return deterministicNarrative(input);
  }
}

function deterministicNarrative(input: StatementNarrativeInput): string {
  const period = `${input.periodStart.slice(0, 10)} through ${input.periodEnd.slice(0, 10)}`;
  const variance = input.varianceTopMovers[0]
    ? ` Largest variance: ${input.varianceTopMovers[0].label} moved by $${input.varianceTopMovers[0].deltaUsd}.`
    : '';
  const warnings = input.scopeWarnings?.length
    ? ` Scope warnings require review before external send: ${input.scopeWarnings.map((warning) => warning.code).join(', ')}.`
    : '';
  return `${input.stakeholderName} is assigned $${input.totalUsd} for ${period}. Totals are computed from hourly_rate_usd multiplied by usage_hours and reconcile against tenant spend of $${input.reconciliation.tenantTotalUsd}. Open anomalies linked to this statement: ${input.openAnomalyCount}.${variance}${warnings}`;
}

function validateStatementNarrative(narrative: string, input: StatementNarrativeInput): void {
  const expectedClaims = [`$${input.totalUsd}`, `$${input.reconciliation.tenantTotalUsd}`];
  if (input.varianceTopMovers[0]) {
    expectedClaims.push(`$${input.varianceTopMovers[0].deltaUsd}`);
  }
  assertValidNumericClaims(narrative, expectedClaims);
}
