import { spawn } from 'node:child_process';

const port = process.env.LIVE_CONTRACT_PORT ?? '3211';
const baseUrl = `http://127.0.0.1:${port}`;

const backend = spawn('npm', ['--workspace', 'backend', 'run', 'start:dev'], {
  env: {
    ...process.env,
    AUTH_ALLOW_TEST_ROLE_HEADER: 'true',
    HOST: '127.0.0.1',
    PORT: port
  },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe']
});

let backendLog = '';
backend.stdout.on('data', (chunk) => {
  backendLog += chunk.toString();
});
backend.stderr.on('data', (chunk) => {
  backendLog += chunk.toString();
});

try {
  await waitForHealth(`${baseUrl}/healthz`, 30000);
  const contract = spawn('npm', ['run', 'test:contract:live'], {
    env: {
      ...process.env,
      LIVE_API_BASE_URL: baseUrl
    },
    stdio: 'inherit'
  });
  const code = await waitForExit(contract, 60000);
  process.exitCode = code;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(backendLog);
  process.exitCode = 1;
} finally {
  terminateProcessTree(backend, 'SIGTERM');
  await waitForExit(backend, 5000).catch(() => {
    terminateProcessTree(backend, 'SIGKILL');
  });
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode ?? 0);
      return;
    }

    const timer = timeoutMs
      ? setTimeout(() => reject(new Error(`Timed out waiting for pid ${child.pid} to exit.`)), timeoutMs)
      : null;
    child.once('exit', (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve(code ?? 0);
    });
    child.once('error', reject);
  });
}

function terminateProcessTree(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      child.kill(signal);
      return;
    }

    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
      throw error;
    }
  }
}
