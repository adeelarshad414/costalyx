import { useState } from 'react';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth, type AuthRedirectOptions } from './AuthProvider';

export type AuthPageMode = 'login' | 'signin' | 'signup';

interface AuthPageProps {
  mode: AuthPageMode;
  protectedPath?: string;
  defaultPath: string;
}

export function AuthPage({ mode, protectedPath, defaultPath }: AuthPageProps) {
  const auth = useAuth();
  const [emailHint, setEmailHint] = useState('');
  const nextPath = protectedPath ?? requestedNextPath(defaultPath) ?? defaultPath;
  const isSignup = mode === 'signup';
  const submitLabel = isSignup ? 'Create account' : 'Sign in';
  const screenLabel = isSignup ? 'Signup' : mode === 'signin' ? 'Signin' : 'Login';
  const alternateHref = isSignup ? `/signin?next=${encodeURIComponent(nextPath)}` : `/signup?next=${encodeURIComponent(nextPath)}`;

  async function submitAuth() {
    const options: AuthRedirectOptions = {
      redirectPath: nextPath,
      loginHint: emailHint
    };
    if (isSignup) {
      await auth.signup(options);
    } else {
      await auth.login(options);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <div>
          <p>Costalyx</p>
          <h1>{isSignup ? 'Create your Costalyx account' : 'Sign in to Costalyx'}</h1>
        </div>
        <ThemeToggle />
      </header>
      <section className="auth-panel" aria-label={screenLabel}>
        {auth.status === 'loading' ? <LoadingState title="Checking sign in" variant="cards" rows={2} /> : null}
        {auth.status === 'error' ? (
          <ErrorState title="Could not initialize sign in" detail={auth.error} onRetry={submitAuth} actionLabel={submitLabel} />
        ) : null}
        {auth.status === 'authenticated' ? (
          <div className="state">
            <h2>You are signed in</h2>
            <p>Continue to your Costalyx workspace.</p>
            <a className="button-link" href={nextPath}>
              Open workspace
            </a>
          </div>
        ) : null}
        {auth.status === 'unauthenticated' ? (
          <>
            <div>
              <p className="section-kicker">{isSignup ? 'Secure signup' : 'Secure sign in'}</p>
              <h2>{isSignup ? 'Start with your work email' : 'Use your Costalyx identity'}</h2>
              <p>
                {isSignup
                  ? 'Costalyx sends account creation to the identity provider so passwords and MFA never live in the app.'
                  : 'Sign in through the configured identity provider to reach your cloud cost workspace.'}
              </p>
            </div>
            <label className="field-row">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={emailHint}
                onChange={(event) => setEmailHint(event.target.value)}
                placeholder="name@company.com"
              />
            </label>
            {auth.error ? <p className="inline-alert">{auth.error}</p> : null}
            <div className="auth-actions">
              <button type="button" onClick={submitAuth}>
                {submitLabel}
              </button>
              <a href={alternateHref}>{isSignup ? 'Already have an account?' : 'Create account'}</a>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function requestedNextPath(defaultPath: string): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || isAuthPath(next)) {
    return null;
  }
  return next || defaultPath;
}

function isAuthPath(path: string): boolean {
  const normalizedPath = path.replace(/\/+$/, '') || '/';
  return normalizedPath === '/login' || normalizedPath === '/signin' || normalizedPath === '/signup';
}
