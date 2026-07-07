import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { useAuth } from './AuthProvider';

interface AuthBoundaryProps {
  children: React.ReactNode;
}

export function AuthBoundary({ children }: AuthBoundaryProps) {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <section className="panel">
        <LoadingState title="Checking sign in" variant="cards" rows={2} />
      </section>
    );
  }

  if (auth.status === 'error') {
    return (
      <section className="panel">
        <ErrorState title="Could not initialize sign in" detail={auth.error} onRetry={auth.login} actionLabel="Sign in" />
      </section>
    );
  }

  if (auth.status === 'unauthenticated') {
    return (
      <section className="panel state">
        <h2>Sign in</h2>
        <p>Cost data is available after authentication.</p>
        <button type="button" onClick={auth.login}>
          Sign in
        </button>
      </section>
    );
  }

  return <>{children}</>;
}
