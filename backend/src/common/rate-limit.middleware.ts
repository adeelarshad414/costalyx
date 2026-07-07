import type { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  disabled: boolean;
  maxRequests: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const defaultMaxRequests = 600;
const defaultWindowMs = 60_000;

export function buildRateLimitOptions(env: NodeJS.ProcessEnv = process.env): RateLimitOptions {
  return {
    disabled: env.COSTALYX_RATE_LIMIT_DISABLED === 'true' || env.COSTALYX_RATE_LIMIT_DISABLED === '1',
    maxRequests: readPositiveInteger(env.COSTALYX_RATE_LIMIT_MAX, defaultMaxRequests),
    windowMs: readPositiveInteger(env.COSTALYX_RATE_LIMIT_WINDOW_MS, defaultWindowMs)
  };
}

export function createRateLimitMiddleware(options: RateLimitOptions = buildRateLimitOptions()) {
  const buckets = new Map<string, RateLimitBucket>();

  return (request: Request, response: Response, next: NextFunction): void => {
    if (options.disabled) {
      next();
      return;
    }

    const now = Date.now();
    const key = clientIdentifier(request);
    const bucket = currentBucket(buckets.get(key), now, options.windowMs);
    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(options.maxRequests - bucket.count, 0);
    response.setHeader('RateLimit-Limit', String(options.maxRequests));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count <= options.maxRequests) {
      next();
      return;
    }

    response.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    response.status(429).json({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded. Try again shortly.'
    });
  };
}

function currentBucket(bucket: RateLimitBucket | undefined, now: number, windowMs: number): RateLimitBucket {
  if (!bucket || bucket.resetAt <= now) {
    return { count: 0, resetAt: now + windowMs };
  }
  return bucket;
}

function clientIdentifier(request: Request): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const forwardedAddress = forwardedValue?.split(',')[0]?.trim();
  return forwardedAddress || request.ip || request.socket.remoteAddress || 'unknown-client';
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}
