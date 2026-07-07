import { Tags } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { toUserFacingError } from '../../utils/userFacingError';

interface AllocationConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type Dimension = Awaited<ReturnType<CostalyxClient['listDimensions']>>['data'][number];
type CostSummary = Awaited<ReturnType<CostalyxClient['getCostSummary']>>;

const defaultDimensionName = 'Team';
const defaultResourceId = 'i-aws-prod-001';
const defaultTagKey = 'owner';
const defaultTagValue = 'platform';

export function AllocationConsole({ client }: AllocationConsoleProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [selectedDimensionId, setSelectedDimensionId] = useState('');
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [error, setError] = useState('');
  const [isMutating, setIsMutating] = useState(false);

  const loadDimensions = useCallback(async () => {
    setState('loading');
    try {
      const response = await client.listDimensions();
      setDimensions(response.data);
      const selected = response.data[0]?.id ?? '';
      setSelectedDimensionId(selected);
      setSummary(selected ? await client.getCostSummary({ dimension: selected }) : null);
      setState('loaded');
    } catch (loadError) {
      setError(toUserFacingError(loadError, 'Load allocation model'));
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void loadDimensions();
  }, [loadDimensions]);

  const createDimension = useCallback(async () => {
    setIsMutating(true);
    try {
      const dimension = await client.createDimension({
        name: defaultDimensionName,
        idempotencyKey: createIdempotencyKey('dimension')
      });
      await client.createDimensionMapping({
        dimensionId: dimension.id,
        tagKey: defaultTagKey,
        tagValuePattern: defaultTagValue,
        idempotencyKey: createIdempotencyKey('mapping')
      });
      setDimensions((current) => [...current, dimension]);
      setSelectedDimensionId(dimension.id);
      setSummary(await client.getCostSummary({ dimension: dimension.id }));
      setState('loaded');
    } catch (mutationError) {
      setError(toUserFacingError(mutationError, 'Create allocation dimension'));
      setState('error');
    } finally {
      setIsMutating(false);
    }
  }, [client]);

  const retagResource = useCallback(async () => {
    setIsMutating(true);
    try {
      await client.upsertResourceTag({
        resourceId: defaultResourceId,
        tagKey: defaultTagKey,
        tagValue: defaultTagValue,
        source: 'manual',
        idempotencyKey: createIdempotencyKey('resource-tag')
      });
      if (selectedDimensionId) {
        setSummary(await client.getCostSummary({ dimension: selectedDimensionId }));
      }
    } catch (mutationError) {
      setError(toUserFacingError(mutationError, 'Retag resource'));
      setState('error');
    } finally {
      setIsMutating(false);
    }
  }, [client, selectedDimensionId]);

  if (state === 'loading') {
    return (
      <section className="panel">
        <LoadingState title="Loading allocation model" variant="cards" rows={4} />
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not load allocation model" detail={error} onRetry={loadDimensions} />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Allocation and dynamic tagging">
      <div className="panel-toolbar">
        <PermissionGate requiredRole="analyst" mode="hide">
          <button type="button" onClick={createDimension} disabled={isMutating}>
            <Tags aria-hidden="true" size={16} />
            Create dimension
          </button>
          <button type="button" onClick={retagResource} disabled={isMutating || !selectedDimensionId}>
            Retag resource
          </button>
        </PermissionGate>
      </div>

      {dimensions.length === 0 ? (
        <EmptyState title="No allocation dimensions yet" />
      ) : (
        <div className="allocation-grid">
          <section aria-label="Custom dimensions">
            <h2>Custom dimensions</h2>
            <ul className="role-list">
              {dimensions.map((dimension) => (
                <li key={dimension.id}>
                  <span>{dimension.name}</span>
                  <span className="font-mono-data">{dimension.id}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Dimension aggregate">
            <h2>Dimension aggregate</h2>
            {summary ? (
              <dl className="metric-list">
                <div>
                  <dt>Total cost</dt>
                  <dd className="font-mono-data">{summary.totalCostUsd}</dd>
                </div>
                <div>
                  <dt>Resources</dt>
                  <dd className="font-mono-data">{summary.resourceCount}</dd>
                </div>
                <div>
                  <dt>Untagged</dt>
                  <dd className="font-mono-data">{summary.untaggedCount}</dd>
                </div>
              </dl>
            ) : (
              <p>No aggregate selected</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function createIdempotencyKey(scope: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }
  return `${scope}-${Date.now()}`;
}
