import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const keycloakUrl = process.env.E2E_KEYCLOAK_URL ?? 'http://127.0.0.1:8080';
const frontendUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const realm = process.env.E2E_KEYCLOAK_REALM ?? 'costalyx-dev';
const clientId = process.env.E2E_KEYCLOAK_CLIENT_ID ?? 'costalyx-web';
const adminUsername = process.env.KEYCLOAK_ADMIN ?? 'admin';
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'CHANGE_ME_DEV_ONLY';
const username = process.env.E2E_KEYCLOAK_USERNAME ?? 'costalyx-e2e-admin';
const password = process.env.E2E_KEYCLOAK_PASSWORD ?? `E2E-${randomUUID()}aA1`;
const roleNames = parseRoleNames(process.env.E2E_KEYCLOAK_ROLE ?? 'admin');
const requestTimeoutMs = Number(process.env.E2E_REQUEST_TIMEOUT_MS ?? 30000);

await waitForUrl(`${keycloakUrl}/realms/${realm}/.well-known/openid-configuration`, 120000);
await waitForUrl(`${apiBaseUrl.replace(/\/api\/v1$/, '')}/healthz`, 120000);
await waitForUrl(frontendUrl, 120000);

const adminToken = await getAdminToken();
await upsertAudienceMapper(adminToken);
await upsertAdminUser(adminToken);

const specs = process.argv.slice(2);
const e2e = spawn('npm', ['run', 'test:e2e', '--', ...(specs.length > 0 ? specs : ['e2e/milestone-a-keycloak-login.spec.ts'])], {
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
  await updateUserProfile(token, userId);
  await resetPassword(token, userId);
  await replaceRealmRoles(token, userId, roleNames);
  console.log(`Seeded Keycloak E2E user ${username} with ${roleNames.join(', ')} role${roleNames.length === 1 ? '' : 's'}.`);
}

async function upsertAudienceMapper(token) {
  const clients = await requestJson(
    `${keycloakUrl}/admin/realms/${realm}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers: authHeaders(token) }
  );
  const client = Array.isArray(clients) ? clients[0] : undefined;
  if (!client?.id) {
    throw new Error(`Keycloak client ${clientId} could not be found.`);
  }

  const mappers = await requestJson(
    `${keycloakUrl}/admin/realms/${realm}/clients/${client.id}/protocol-mappers/models`,
    { headers: authHeaders(token) }
  );
  if (Array.isArray(mappers) && mappers.some((mapper) => mapper?.name === `${clientId}-audience`)) {
    return;
  }

  await requestNoContent(`${keycloakUrl}/admin/realms/${realm}/clients/${client.id}/protocol-mappers/models`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${clientId}-audience`,
      protocol: 'openid-connect',
      protocolMapper: 'oidc-audience-mapper',
      consentRequired: false,
      config: {
        'included.client.audience': clientId,
        'access.token.claim': 'true',
        'id.token.claim': 'false'
      }
    })
  });
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
      email: `${username}@example.test`,
      firstName: 'Costalyx',
      lastName: 'E2E'
    })
  });
  const created = await findUser(token);
  if (!created?.id) {
    throw new Error('Created Keycloak user could not be found.');
  }
  return created.id;
}

async function updateUserProfile(token, userId) {
  await requestNoContent(`${keycloakUrl}/admin/realms/${realm}/users/${userId}`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      enabled: true,
      emailVerified: true,
      email: `${username}@example.test`,
      firstName: 'Costalyx',
      lastName: 'E2E'
    })
  });
}

async function resetPassword(token, userId) {
  await requestNoContent(`${keycloakUrl}/admin/realms/${realm}/users/${userId}/reset-password`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'password', value: password, temporary: false })
  });
}

async function replaceRealmRoles(token, userId, names) {
  const currentRoles = await requestJson(`${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
    headers: authHeaders(token)
  });
  const managedCurrentRoles = Array.isArray(currentRoles)
    ? currentRoles.filter((role) => role?.name === 'viewer' || role?.name === 'analyst' || role?.name === 'admin')
    : [];

  if (managedCurrentRoles.length > 0) {
    await requestNoContent(`${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
      method: 'DELETE',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(managedCurrentRoles)
    });
  }

  const desiredRoles = [];
  for (const name of names) {
    desiredRoles.push(
      await requestJson(`${keycloakUrl}/admin/realms/${realm}/roles/${name}`, {
        headers: authHeaders(token)
      })
    );
  }

  await requestNoContent(`${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(desiredRoles)
  });
}

function parseRoleNames(value) {
  const names = value
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
  if (names.length === 0 || names.some((role) => !['viewer', 'analyst', 'admin'].includes(role))) {
    throw new Error('E2E_KEYCLOAK_ROLE must be one or more of viewer, analyst, admin.');
  }
  return [...new Set(names)];
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(url);
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
  const response = await fetchWithTimeout(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}: ${body.slice(0, 240)}`);
  }
  return body ? JSON.parse(body) : {};
}

async function requestNoContent(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}: ${body.slice(0, 240)}`);
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('exit', (code) => resolve(code ?? 0));
    child.once('error', reject);
  });
}
