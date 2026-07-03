import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const keycloakUrl = process.env.E2E_KEYCLOAK_URL ?? 'http://127.0.0.1:8080';
const frontendUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const realm = process.env.E2E_KEYCLOAK_REALM ?? 'costalyx-dev';
const adminUsername = process.env.KEYCLOAK_ADMIN ?? 'admin';
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'CHANGE_ME_DEV_ONLY';
const username = process.env.E2E_KEYCLOAK_USERNAME ?? 'costalyx-e2e-admin';
const password = process.env.E2E_KEYCLOAK_PASSWORD ?? `E2E-${randomUUID()}aA1`;

await waitForUrl(`${keycloakUrl}/realms/${realm}/.well-known/openid-configuration`, 120000);
await waitForUrl(`${apiBaseUrl.replace(/\/api\/v1$/, '')}/healthz`, 120000);
await waitForUrl(frontendUrl, 120000);

const adminToken = await getAdminToken();
await upsertAdminUser(adminToken);

const e2e = spawn('npm', ['run', 'test:e2e', '--', 'e2e/milestone-a-keycloak-login.spec.ts'], {
  env: {
    ...process.env,
    E2E_BASE_URL: frontendUrl,
    E2E_KEYCLOAK_USERNAME: username,
    E2E_KEYCLOAK_PASSWORD: password
  },
  stdio: 'inherit'
});

process.exitCode = await waitForExit(e2e);

async function getAdminToken() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: adminUsername,
    password: adminPassword
  });
  const token = await requestJson(`${keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (typeof token.access_token !== 'string') {
    throw new Error('Keycloak admin token response did not contain an access_token.');
  }
  return token.access_token;
}

async function upsertAdminUser(token) {
  const existing = await findUser(token);
  const userId = existing?.id ?? (await createUser(token));
  await resetPassword(token, userId);
  await assignRealmRole(token, userId, 'admin');
  console.log(`Seeded Keycloak E2E user ${username} with admin role.`);
}

async function findUser(token) {
  const users = await requestJson(
    `${keycloakUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers: authHeaders(token) }
  );
  return Array.isArray(users) ? users[0] : undefined;
}

async function createUser(token) {
  await requestNoContent(`${keycloakUrl}/admin/realms/${realm}/users`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      enabled: true,
      emailVerified: true,
      email: `${username}@example.test`
    })
  });
  const created = await findUser(token);
  if (!created?.id) {
    throw new Error('Created Keycloak user could not be found.');
  }
  return created.id;
}

async function resetPassword(token, userId) {
  await requestNoContent(`${keycloakUrl}/admin/realms/${realm}/users/${userId}/reset-password`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'password', value: password, temporary: false })
  });
}

async function assignRealmRole(token, userId, roleName) {
  const role = await requestJson(`${keycloakUrl}/admin/realms/${realm}/roles/${roleName}`, {
    headers: authHeaders(token)
  });
  await requestNoContent(`${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify([role])
  });
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}: ${body.slice(0, 240)}`);
  }
  return body ? JSON.parse(body) : {};
}

async function requestNoContent(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}: ${body.slice(0, 240)}`);
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('exit', (code) => resolve(code ?? 0));
    child.once('error', reject);
  });
}
