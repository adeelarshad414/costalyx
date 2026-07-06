import { applySecurityHeaders } from '../../src/common/security-headers';

class HeaderSink {
  readonly headers = new Map<string, string | number | readonly string[]>();

  setHeader(name: string, value: string | number | readonly string[]): void {
    this.headers.set(name, value);
  }
}

describe('applySecurityHeaders', () => {
  it('sets baseline API security headers without HSTS in local mode', () => {
    const response = new HeaderSink();

    applySecurityHeaders(response, { APP_ENV: 'local' });

    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(response.headers.get('Strict-Transport-Security')).toBeUndefined();
  });

  it('adds HSTS outside local mode', () => {
    const response = new HeaderSink();

    applySecurityHeaders(response, { APP_ENV: 'production' });

    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });
});
