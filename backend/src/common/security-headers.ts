import type { NextFunction, Request, Response } from 'express';

type EnvironmentMap = Record<string, string | undefined>;
type HeaderSink = {
  setHeader(name: string, value: string | number | readonly string[]): unknown;
};

const baseHeaders: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

export function applySecurityHeaders(response: HeaderSink, env: EnvironmentMap = process.env): void {
  for (const [name, value] of Object.entries(baseHeaders)) {
    response.setHeader(name, value);
  }

  if (resolveAppEnvironment(env) !== 'local') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

export function securityHeadersMiddleware(_request: Request, response: Response, next: NextFunction): void {
  applySecurityHeaders(response);
  next();
}

function resolveAppEnvironment(env: EnvironmentMap): string {
  if (env.APP_ENV?.trim()) {
    return env.APP_ENV.trim().toLowerCase();
  }
  if (env.NODE_ENV?.trim().toLowerCase() === 'production') {
    return 'production';
  }
  return 'local';
}
