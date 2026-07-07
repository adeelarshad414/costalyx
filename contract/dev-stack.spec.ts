import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';

interface ComposeService {
  build?: string | { context?: string; dockerfile?: string };
  command?: string[];
  volumes?: string[];
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
}

function readCompose(): ComposeFile {
  return yaml.load(fs.readFileSync('docker-compose.yml', 'utf8')) as ComposeFile;
}

describe('local dev stack contract', () => {
  it('mounts the Keycloak realm import with the filename Keycloak 26 expects', () => {
    const compose = readCompose();
    const volumes = compose.services?.keycloak?.volumes ?? [];

    expect(volumes).toContain(
      './deploy/keycloak/costalyx-realm.json:/opt/keycloak/data/import/costalyx-dev-realm.json:ro'
    );
  });

  it('builds backend and frontend dev images from the repo workspace root', () => {
    const compose = readCompose();

    expect(compose.services?.backend?.build).toMatchObject({
      context: '.',
      dockerfile: 'backend/Dockerfile.dev'
    });
    expect(compose.services?.frontend?.build).toMatchObject({
      context: '.',
      dockerfile: 'frontend/Dockerfile.dev'
    });
  });

  it('runs dev services through npm workspaces so root lockfile and tsconfig are available', () => {
    const compose = readCompose();

    expect(compose.services?.backend?.command).toEqual(['npm', '--workspace', 'backend', 'run', 'start:dev']);
    expect(compose.services?.frontend?.command).toEqual([
      'npm',
      '--workspace',
      'frontend',
      'run',
      'dev',
      '--',
      '--host',
      '0.0.0.0'
    ]);
    expect(compose.services?.backend?.volumes).toContain('.:/workspace');
    expect(compose.services?.frontend?.volumes).toContain('.:/workspace');
  });

  it('dev Dockerfiles install from the root workspace package-lock', () => {
    const backendDockerfile = fs.readFileSync('backend/Dockerfile.dev', 'utf8');
    const frontendDockerfile = fs.readFileSync('frontend/Dockerfile.dev', 'utf8');

    for (const dockerfile of [backendDockerfile, frontendDockerfile]) {
      expect(dockerfile).toContain('WORKDIR /workspace');
      expect(dockerfile).toContain('COPY package*.json ./');
      expect(dockerfile).toContain('RUN npm install');
    }
  });
});
