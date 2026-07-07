import { useCallback, useEffect, useState } from 'react';
import { costalyxClient, type CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { toUserFacingError } from '../../utils/userFacingError';

interface IngestionOverviewProps {
  client?: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type CostRecord = Awaited<ReturnType<CostalyxClient['listCostRecords']>>['data'][number];
const demoIngestionSourceUri =
  import.meta.env.VITE_DEMO_INGESTION_SOURCE_URI ?? 'backend/test/fixtures/aws-cur-sample.csv';

export function IngestionOverview({ client = costalyxClient }: IngestionOverviewProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [error, setError] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

  const loadRecords = useCallback(async () => {
    setState('loading');
    try {
      const response = await client.listCostRecords();
      setRecords(response.data);
      setState('loaded');
    } catch (loadError) {
      setError(toUserFacingError(loadError, 'Load cost records'));
      setState('error');
    }
  }, [client]);

  const runIngestion = useCallback(async () => {
    setIsIngesting(true);
    try {
      await client.createIngestionBatch({
        provider: 'aws',
        sourceUri: demoIngestionSourceUri,
        idempotencyKey: createIdempotencyKey()
      });
      await loadRecords();
    } catch (ingestionError) {
      setError(toUserFacingError(ingestionError, 'Run ingestion'));
      setState('error');
    } finally {
      setIsIngesting(false);
    }
  }, [client, loadRecords]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const ingestionButton = (
    <PermissionGate requiredRole="admin" mode="hide">
      <button type="button" onClick={runIngestion} disabled={isIngesting}>
        {isIngesting ? 'Running ingestion' : 'Run ingestion'}
      </button>
    </PermissionGate>
  );

  if (state === 'loading') {
    return (
      <section className="panel" aria-busy="true">
        <p>Loading cost records</p>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not load cost records" detail={error} onRetry={loadRecords} />
      </section>
    );
  }

  if (records.length === 0) {
    return (
      <section className="panel">
        <EmptyState
          title="No cost records yet"
          action={ingestionButton}
        />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Normalized cost records">
      <div className="panel-toolbar">
        {ingestionButton}
      </div>
      <table>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Service</th>
            <th>Lease</th>
            <th className="numeric-cell">Cost</th>
            <th>Estimate</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td className="font-mono-data">{record.resourceId}</td>
              <td>{record.serviceName}</td>
              <td>{record.leaseType}</td>
              <td className="font-mono-data numeric-cell">{record.costTotalUsd}</td>
              <td>{record.isEstimate ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `manual-ingestion-${crypto.randomUUID()}`;
  }
  return `manual-ingestion-${Date.now()}`;
}
