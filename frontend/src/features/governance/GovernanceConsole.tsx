import { Download } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { PermissionGate } from '../../auth/PermissionGate';
import { ErrorState } from '../../components/ErrorState';
import { toUserFacingError } from '../../utils/userFacingError';

interface GovernanceConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';
type RoleRecord = Awaited<ReturnType<CostalyxClient['listRoles']>>['data'][number];

export function GovernanceConsole({ client }: GovernanceConsoleProps) {
  const auth = useAuth();
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState('');
  const [exportState, setExportState] = useState('');

  const loadRoles = useCallback(async () => {
    if (auth.role !== 'admin') {
      return;
    }
    setState('loading');
    try {
      const response = await client.listRoles();
      setRoles(response.data);
      setState('loaded');
    } catch (loadError) {
      setError(toUserFacingError(loadError, 'Load roles'));
      setState('error');
    }
  }, [auth.role, client]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const exportCsv = useCallback(async () => {
    const csv = await client.exportCostRecords();
    setExportState(`${csv.split('\n').filter(Boolean).length} CSV rows ready`);
  }, [client]);

  return (
    <section className="panel" aria-label="Access and trust controls">
      <div className="panel-toolbar">
        <button type="button" onClick={exportCsv}>
          <Download aria-hidden="true" size={16} />
          Export CSV
        </button>
        {exportState ? <span className="session-pill">{exportState}</span> : null}
      </div>

      <PermissionGate requiredRole="admin" mode="hide">
        <div className="governance-grid">
          <section aria-label="Fixed role inventory">
            <h2>Fixed roles</h2>
            {state === 'loading' ? <p>Loading roles</p> : null}
            {state === 'error' ? (
              <ErrorState title="Could not load roles" detail={error} onRetry={loadRoles} />
            ) : null}
            {state === 'loaded' ? (
              <ul className="role-list">
                {roles.map((role) => (
                  <li key={role.name}>
                    <span>{role.name}</span>
                    <span>{role.fixed ? 'Fixed' : 'Custom'}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section aria-label="Privileged actions">
            <h2>Privileged actions</h2>
            <div className="action-row">
              <button type="button">Register credential</button>
              <button type="button">Create account group</button>
              <button type="button">Invite user</button>
            </div>
          </section>
        </div>
      </PermissionGate>
    </section>
  );
}
