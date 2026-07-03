import { useCallback, useEffect, useState } from 'react';
import { costalyxClient, type CostalyxClient } from '../../api/client';
import { PermissionGate } from '../../auth/PermissionGate';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';

interface IngestionOverviewProps {
  client?: CostalyxClient;
}

type LoadState = 'loading' | 'loaded' | 'error';
type CostRecord = Awaited<ReturnType<CostalyxClient['listCostRecords']>>['data'][number];

export function IngestionOverview({ client = costalyxClient }: IngestionOverviewProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [error, setError] = useState('');

  const loadRecords = useCallback(async () => {
    setState('loading');
    try {
      const response = await client.listCostRecords();
      setRecords(response.data);
      setState('loaded');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown API failure');
      setState('error');
    }
  }, [client]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

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
          action={
            <PermissionGate requiredRole="admin" mode="hide">
              <button type="button">Run ingestion</button>
            </PermissionGate>
          }
        />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Normalized cost records">
      <div className="panel-toolbar">
        <PermissionGate requiredRole="admin" mode="hide">
          <button type="button">Run ingestion</button>
        </PermissionGate>
      </div>
      <table>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Service</th>
            <th>Lease</th>
            <th>Cost</th>
            <th>Estimate</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td className="font-mono-data">{record.resourceId}</td>
              <td>{record.serviceName}</td>
              <td>{record.leaseType}</td>
              <td className="font-mono-data">{record.costTotalUsd}</td>
              <td>{record.isEstimate ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
