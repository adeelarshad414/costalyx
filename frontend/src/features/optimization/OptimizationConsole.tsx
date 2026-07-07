import { CheckCircle2, PiggyBank } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { toUserFacingError } from '../../utils/userFacingError';

interface OptimizationConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type Recommendation = Awaited<ReturnType<CostalyxClient['listRecommendations']>>['data'][number];
type RealizedSaving = Awaited<ReturnType<CostalyxClient['listRealizedSavings']>>['data'][number];

export function OptimizationConsole({ client }: OptimizationConsoleProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [savings, setSavings] = useState<RealizedSaving[]>([]);
  const [error, setError] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const loadOptimization = useCallback(async () => {
    setState('loading');
    try {
      const [recommendationResponse, savingsResponse] = await Promise.all([
        client.listRecommendations({ status: 'open' }),
        client.listRealizedSavings()
      ]);
      setRecommendations(recommendationResponse.data);
      setSavings(savingsResponse.data);
      setState('loaded');
    } catch (loadError) {
      setError(toUserFacingError(loadError, 'Load optimization'));
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void loadOptimization();
  }, [loadOptimization]);

  const applyRecommendation = useCallback(
    async (recommendation: Recommendation) => {
      setIsApplying(true);
      try {
        await client.updateRecommendation({
          id: recommendation.id,
          status: 'applied',
          idempotencyKey: createIdempotencyKey('recommendation-apply')
        });
        await loadOptimization();
      } catch (applyError) {
        setError(toUserFacingError(applyError, 'Apply recommendation'));
        setState('error');
      } finally {
        setIsApplying(false);
      }
    },
    [client, loadOptimization]
  );

  if (state === 'loading') {
    return (
      <section className="panel" aria-busy="true">
        <p>Loading optimization</p>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not load optimization" detail={error} onRetry={loadOptimization} />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Optimization recommendations">
      <div className="optimization-grid">
        <section aria-label="Recommendations">
          <h2>Recommendations</h2>
          {recommendations.length === 0 ? (
            <EmptyState title="No open recommendations" detail="New opportunities appear after ingestion." />
          ) : (
            <ul className="optimization-list">
              {recommendations.map((recommendation) => (
                <li key={recommendation.id}>
                  <PiggyBank aria-hidden="true" size={18} />
                  <div>
                    <strong>{recommendation.resourceId}</strong>
                    <span>{recommendation.type}</span>
                  </div>
                  <span className="font-mono-data">{recommendation.estimatedSavingsUsd}</span>
                  <PermissionGate requiredRole="analyst" mode="hide">
                    <button type="button" onClick={() => applyRecommendation(recommendation)} disabled={isApplying}>
                      Apply recommendation
                    </button>
                  </PermissionGate>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Realized Savings">
          <h2>Realized Savings</h2>
          {savings.length === 0 ? (
            <EmptyState title="No realized savings yet" detail="Applied recommendations create verified ledger rows." />
          ) : (
            <ul className="optimization-list">
              {savings.map((saving) => (
                <li key={saving.id}>
                  <CheckCircle2 aria-hidden="true" size={18} />
                  <div>
                    <strong>{saving.verificationSource}</strong>
                    <span className="font-mono-data">{saving.recommendationId}</span>
                  </div>
                  <span className="font-mono-data">{saving.deltaUsd}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

function createIdempotencyKey(scope: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }
  return `${scope}-${Date.now()}`;
}
