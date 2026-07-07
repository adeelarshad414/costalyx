#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const image = process.env.COSTALYX_BACKEND_IMAGE_SMOKE ?? 'costalyx-backend:observability-smoke';
const container = `costalyx-backend-observability-${process.pid}`;
const network = process.env.COSTALYX_DOCKER_NETWORK ?? 'costalyx_costalyx';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: 1024 * 1024 * 16
  });
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString('utf8');
    throw new Error(stderr?.trim() || `${command} ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function cleanup() {
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
}

async function waitForReady(baseUrl) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health/ready`);
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`ready returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError ?? new Error('backend image did not become ready');
}

function mappedBaseUrl() {
  const mapped = String(run('docker', ['port', container, '3000/tcp'])).trim();
  const address = mapped.includes('0.0.0.0:') ? mapped.replace('0.0.0.0:', '127.0.0.1:') : mapped;
  return `http://${address}`;
}

function assertJsonLogLine(logs) {
  const parsed = logs
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const startupLine = parsed.find((entry) => entry.service === 'costalyx-backend' && entry.level);
  if (!startupLine) {
    throw new Error('No structured JSON backend log line found in production image logs.');
  }
}

try {
  console.log(`Building backend production image ${image}...`);
  run('docker', ['build', '-f', 'backend/Dockerfile', '-t', image, '.']);

  cleanup();
  console.log(`Starting ${container} on ${network}...`);
  run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    container,
    '--network',
    network,
    '-p',
    '127.0.0.1::3000',
    '-e',
    'APP_ENV=local',
    '-e',
    'NODE_ENV=production',
    '-e',
    'COSTALYX_LOG_FORMAT=json',
    '-e',
    'AUTH_ALLOW_TEST_ROLE_HEADER=true',
    '-e',
    'DATABASE_URL=postgresql://costalyx:CHANGE_ME_DEV_ONLY@postgres:5432/costalyx_dev',
    '-e',
    'VAULT_ADDR=http://vault:8200',
    '-e',
    'VAULT_TOKEN=CHANGE_ME_DEV_ONLY',
    '-e',
    'REDPANDA_BROKERS=redpanda:9092',
    '-e',
    'SMTP_HOST=mailpit',
    '-e',
    'SMTP_PORT=1025',
    '-e',
    'USE_MOCKS=false',
    image
  ]);

  const baseUrl = mappedBaseUrl();
  const ready = await waitForReady(baseUrl);
  if (ready.status !== 'ready') {
    throw new Error(`Unexpected readiness payload: ${JSON.stringify(ready)}`);
  }

  const metrics = await fetch(`${baseUrl}/metrics`, { headers: { 'x-costalyx-role': 'admin' } });
  if (!metrics.ok) {
    throw new Error(`/metrics returned ${metrics.status}`);
  }
  const metricsText = await metrics.text();
  if (!metricsText.includes('costalyx_build_info') || !metricsText.includes('costalyx_cloud_connections_total')) {
    throw new Error('/metrics response is missing required Costalyx metrics.');
  }

  const logs = String(run('docker', ['logs', container]));
  assertJsonLogLine(logs);
  console.log('Production image observability smoke passed: readiness, metrics, and JSON logs verified.');
} finally {
  cleanup();
}
