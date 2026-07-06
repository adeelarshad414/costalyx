import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

type EnvironmentMap = Record<string, string | undefined>;
type AllowedOrigins = true | Set<string>;

export function buildCorsOptions(env: EnvironmentMap = process.env): CorsOptions {
  const allowedOrigins = resolveCorsAllowedOrigins(env);

  return {
    credentials: false,
    origin(origin, callback) {
      if (isCorsOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by the Costalyx CORS policy.'), false);
    }
  };
}

export function resolveCorsAllowedOrigins(env: EnvironmentMap = process.env): AllowedOrigins {
  const configuredOrigins = env.COSTALYX_ALLOWED_ORIGINS?.trim();
  if (configuredOrigins) {
    const origins = new Set(
      configuredOrigins
        .split(',')
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean)
    );
    if (origins.size === 0) {
      throw new Error('COSTALYX_ALLOWED_ORIGINS must include at least one http(s) origin.');
    }
    return origins;
  }

  if (resolveAppEnvironment(env) === 'local') {
    return true;
  }

  throw new Error(
    'COSTALYX_ALLOWED_ORIGINS must be set to comma-separated frontend/auth origins before starting Costalyx outside APP_ENV=local.'
  );
}

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: AllowedOrigins): boolean {
  if (!origin) {
    return true;
  }
  if (allowedOrigins === true) {
    return true;
  }
  return allowedOrigins.has(normalizeOrigin(origin));
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid CORS origin "${trimmed}". Expected an http(s) origin such as https://app.example.com.`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Invalid CORS origin "${trimmed}". Only http and https origins are supported.`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`Invalid CORS origin "${trimmed}". Use only the scheme, host, and optional port.`);
  }

  return parsed.origin;
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
