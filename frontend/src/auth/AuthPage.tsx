import { BarChart3, Cloud, Radar, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button, ButtonLink } from '../components/Button';
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
          <span className="auth-subtitle">Multi-cloud cost operations built for finance, engineering, and platform teams.</span>
        </div>
        <ThemeToggle />
      </header>
      <div className="auth-layout">
        <section className="auth-showcase" aria-label="Costalyx capabilities">
          <div className="auth-showcase-copy">
            <p className="section-kicker">Customer handover ready</p>
            <h2>Operate every cloud account separately, together, and with evidence.</h2>
            <p>
              Costalyx gives buyers a clean view of portfolio health, billing anomalies, executive trend, and governed
              access without relying on spreadsheet-only workflows.
            </p>
          </div>
          <div className="auth-capability-grid">
            <article>
              <Cloud aria-hidden="true" size={18} />
              <strong>Portfolio visibility</strong>
              <span>AWS, Azure, and GCP connections roll up cleanly without hiding per-account detail.</span>
            </article>
            <article>
              <BarChart3 aria-hidden="true" size={18} />
              <strong>Executive clarity</strong>
              <span>Trend, budget posture, and spend context stay presentation-ready from the first screen.</span>
            </article>
            <article>
              <Radar aria-hidden="true" size={18} />
              <strong>Billing intelligence</strong>
              <span>Anomalies, statements, and explainable narratives stay attached to the underlying evidence.</span>
            </article>
            <article>
              <ShieldCheck aria-hidden="true" size={18} />
              <strong>Readonly by practice</strong>
              <span>Cloud onboarding is designed around readonly customer roles and explicit operator guardrails.</span>
            </article>
          </div>
        </section>

        <section className="auth-panel" aria-label={screenLabel}>
          {auth.status === 'loading' ? <LoadingState title="Checking sign in" variant="cards" rows={2} /> : null}
          {auth.status === 'error' ? (
            <ErrorState title="Could not initialize sign in" detail={auth.error} onRetry={submitAuth} actionLabel={submitLabel} />
          ) : null}
          {auth.status === 'authenticated' ? (
            <div className="state">
              <h2>You are signed in</h2>
              <p>Continue to your Costalyx workspace.</p>
              <ButtonLink href={nextPath} variant="primary">
                Open workspace
              </ButtonLink>
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
                <Button onClick={submitAuth}>{submitLabel}</Button>
                <ButtonLink href={alternateHref} variant="link">
                  {isSignup ? 'Already have an account?' : 'Create account'}
                </ButtonLink>
              </div>
            </>
          ) : null}
        </section>
      </div>
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
