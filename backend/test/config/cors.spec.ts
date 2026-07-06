import { buildCorsOptions, isCorsOriginAllowed, resolveCorsAllowedOrigins } from '../../src/config/cors';

describe('CORS configuration', () => {
  it('keeps local development permissive when no allow-list is configured', () => {
    const allowedOrigins = resolveCorsAllowedOrigins({ APP_ENV: 'local' });

    expect(allowedOrigins).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:5173', allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed('https://app.example.test', allowedOrigins)).toBe(true);
  });

  it('requires explicit allowed origins outside local mode', () => {
    expect(() => resolveCorsAllowedOrigins({ APP_ENV: 'production' })).toThrow('COSTALYX_ALLOWED_ORIGINS');
    expect(() => resolveCorsAllowedOrigins({ NODE_ENV: 'production' })).toThrow('COSTALYX_ALLOWED_ORIGINS');
  });

  it('normalizes comma-separated origins and rejects unlisted browser origins', () => {
    const allowedOrigins = resolveCorsAllowedOrigins({
      APP_ENV: 'production',
      COSTALYX_ALLOWED_ORIGINS: 'https://app.example.test/, https://auth.example.test'
    });

    expect(isCorsOriginAllowed('https://app.example.test', allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed('https://auth.example.test', allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed(undefined, allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed('https://attacker.example.test', allowedOrigins)).toBe(false);
  });

  it('rejects invalid origin entries with paths, query strings, or unsupported protocols', () => {
    expect(() =>
      resolveCorsAllowedOrigins({ APP_ENV: 'production', COSTALYX_ALLOWED_ORIGINS: 'https://app.example.test/path' })
    ).toThrow('scheme, host, and optional port');
    expect(() =>
      resolveCorsAllowedOrigins({ APP_ENV: 'production', COSTALYX_ALLOWED_ORIGINS: 'https://app.example.test?x=1' })
    ).toThrow('scheme, host, and optional port');
    expect(() =>
      resolveCorsAllowedOrigins({ APP_ENV: 'production', COSTALYX_ALLOWED_ORIGINS: 'chrome-extension://abcd' })
    ).toThrow('Only http and https origins are supported');
  });

  it('builds a Nest CORS callback that blocks disallowed origins', () => {
    const options = buildCorsOptions({
      APP_ENV: 'production',
      COSTALYX_ALLOWED_ORIGINS: 'https://app.example.test'
    });
    const origin = options.origin as (
      requestOrigin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void
    ) => void;

    expect(runOriginCallback(origin, 'https://app.example.test')).toEqual({ allowed: true });
    expect(runOriginCallback(origin, 'https://evil.example.test')).toMatchObject({
      allowed: false,
      error: expect.any(Error)
    });
  });
});

function runOriginCallback(
  origin: (requestOrigin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => void,
  requestOrigin: string
): { allowed?: boolean; error?: Error } {
  const result: { allowed?: boolean; error?: Error } = {};
  origin(requestOrigin, (error, allowed) => {
    result.error = error ?? undefined;
    result.allowed = allowed;
  });
  return result;
}
