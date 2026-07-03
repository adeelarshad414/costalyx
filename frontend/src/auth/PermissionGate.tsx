import { ErrorState } from '../components/ErrorState';
import { useAuth } from './AuthProvider';
import { hasRequiredRole, type Role } from './roles';

interface PermissionGateProps {
  requiredRole: Role;
  mode?: 'hide' | 'error';
  children: React.ReactNode;
}

export function PermissionGate({ requiredRole, mode = 'hide', children }: PermissionGateProps) {
  const auth = useAuth();
  const allowed = auth.status === 'authenticated' && hasRequiredRole(auth.role, requiredRole);

  if (allowed) {
    return <>{children}</>;
  }

  if (mode === 'hide' || auth.status === 'loading') {
    return null;
  }

  return (
    <ErrorState
      title="Access restricted"
      detail={`Requires ${requiredRole} access.`}
      onRetry={auth.login}
      actionLabel={auth.status === 'authenticated' ? 'Sign in again' : 'Sign in'}
    />
  );
}
