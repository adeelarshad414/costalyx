/// <reference types="node" />

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

interface StaticServerModule {
  buildSecurityHeaders(env?: Record<string, string | undefined>): Record<string, string>;
  createStaticServer(options?: { root?: string; env?: Record<string, string | undefined> }): import('node:http').Server;
}

// @ts-ignore The production static server is an ESM runtime file outside the TS source tree.
const { buildSecurityHeaders, createStaticServer }: StaticServerModule = await import('../server.mjs');

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('frontend production static server security headers', () => {
  it('builds a CSP that allows the configured API and Keycloak origins only where needed', () => {
    const headers = buildSecurityHeaders({
      VITE_API_BASE_URL: 'https://api.example.test/api/v1',
      VITE_KEYCLOAK_URL: 'https://auth.example.test'
    });

    expect(headers['Content-Security-Policy']).toContain(
      "connect-src 'self' https://api.example.test https://auth.example.test"
    );
    expect(headers['Content-Security-Policy']).toContain("frame-src 'self' https://auth.example.test");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('serves SPA fallback responses with baseline browser security headers', async () => {
    const root = await makeStaticRoot();
    const server = createStaticServer({
      root,
      env: {
        VITE_API_BASE_URL: 'https://api.example.test/api/v1',
        VITE_KEYCLOAK_URL: 'https://auth.example.test'
      }
    });
    await listen(server);

    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/portfolio/cloud`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<div id="root"></div>');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('permissions-policy')).toContain('geolocation=()');
    } finally {
      await close(server);
    }
  });
});

async function makeStaticRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'costalyx-frontend-'));
  tempDirs.push(root);
  await writeFile(path.join(root, 'index.html'), '<!doctype html><div id="root"></div>');
  return root;
}

function listen(server: import('node:http').Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: import('node:http').Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
