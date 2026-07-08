import { Download } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CostalyxClient } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { PermissionGate } from '../../auth/PermissionGate';
import { bootstrapKeys, takeBootstrapValue } from '../../bootstrapCache';
import { ErrorState } from '../../components/ErrorState';
import { ProgressButton } from '../../components/LoadingExperience';
import { LoadingState } from '../../components/LoadingState';
import { toUserFacingError } from '../../utils/userFacingError';

interface GovernanceConsoleProps {
  client: CostalyxClient;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';
type RoleRecord = Awaited<ReturnType<CostalyxClient['listRoles']>>['data'][number];
interface GovernanceBootstrap {
  roles: RoleRecord[];
}

export function GovernanceConsole({ client }: GovernanceConsoleProps) {
  const auth = useAuth();
  const [bootstrappedGovernance] = useState<GovernanceBootstrap | null>(
    () => takeBootstrapValue<GovernanceBootstrap>(bootstrapKeys.governance) ?? null
  );
  const [roles, setRoles] = useState<RoleRecord[]>(() => bootstrappedGovernance?.roles ?? []);
  const [state, setState] = useState<LoadState>(() =>
    auth.role === 'admin' && bootstrappedGovernance ? 'loaded' : 'idle'
  );
  const [error, setError] = useState('');
  const [exportState, setExportState] = useState('');
  const [isExporting, setIsExporting] = useState(false);

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
    if (bootstrappedGovernance) {
      return;
    }
    void loadRoles();
  }, [bootstrappedGovernance, loadRoles]);

  const exportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      const csv = await client.exportCostRecords();
      setExportState(`${csv.split('\n').filter(Boolean).length} CSV rows ready`);
    } finally {
      setIsExporting(false);
    }
  }, [client]);

  return (
    <section className="panel" aria-label="Access and trust controls">
      <div className="panel-toolbar">
        <ProgressButton idleLabel="Export CSV" runningLabel="Exporting CSV..." isRunning={isExporting} onClick={exportCsv}>
          <Download aria-hidden="true" size={16} />
        </ProgressButton>
        {exportState ? <span className="session-pill">{exportState}</span> : null}
      </div>

      <PermissionGate requiredRole="admin" mode="hide">
        <div className="governance-grid">
          <section aria-label="Fixed role inventory">
            <h2>Fixed roles</h2>
            {state === 'loading' ? <LoadingState title="Loading roles" variant="list" rows={3} /> : null}
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
              <Button variant="secondary" size="compact" disabled>
                Register credential
              </Button>
              <Button variant="secondary" size="compact" disabled>
                Create account group
              </Button>
              <Button variant="secondary" size="compact" disabled>
                Invite user
              </Button>
            </div>
          </section>
        </div>
      </PermissionGate>
    </section>
  );
}
