import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

export const hasKeycloakCredentials = Boolean(process.env.E2E_KEYCLOAK_USERNAME && process.env.E2E_KEYCLOAK_PASSWORD);

export const productRoutePaths = {
  'Cloud portfolio': '/portfolio',
  Costs: '/costs',
  Executive: '/executive',
  Insights: '/insights',
  Optimization: '/optimization',
  'Billing Agent': '/billing-agent',
  Reporting: '/reporting',
  Allocation: '/allocation',
  Governance: '/governance',
  Settings: '/settings',
  Operator: '/operator'
} as const;

export async function signInAsAdmin(page: Page, landingPath = '/portfolio') {
  await signInAsSeededUser(page, landingPath);

  await expect(page.getByRole('navigation', { name: 'Product sections' })).toBeVisible({ timeout: 45000 });
}

export async function signInAsSeededUser(page: Page, landingPath = '/portfolio') {
  await page.goto(`/login?next=${encodeURIComponent(landingPath)}`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/protocol\/openid-connect\/auth|\/realms\/costalyx-dev/, { timeout: 90000 });
  await page.getByLabel(/username|email/i).fill(process.env.E2E_KEYCLOAK_USERNAME ?? '');
  await page.getByRole('textbox', { name: /^password$/i }).fill(process.env.E2E_KEYCLOAK_PASSWORD ?? '');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 45000 });
  await expect(page).toHaveURL(new RegExp(`${escapeForRegExp(landingPath)}(?:[?#].*)?$`));
}

export async function openProductPage(page: Page, label: keyof typeof productRoutePaths) {
  const path = productRoutePaths[label];
  await page.getByRole('navigation', { name: 'Product sections' }).getByRole('link', { name: label }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeForRegExp(path)}(?:[?#].*)?$`));
}

export async function capturePersonaEvidence(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

export async function expectNoUserVisibleFailures(page: Page) {
  await expect(page.getByText(/Could not load|Could not initialize|Access restricted/)).toHaveCount(0);
}

export function personaSkipReason() {
  return 'E2E_KEYCLOAK_USERNAME and E2E_KEYCLOAK_PASSWORD are required.';
}

export function mailpitBaseUrl() {
  return process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025';
}

export async function mailpitRecipients(request: APIRequestContext): Promise<string[]> {
  const response = await request.get(`${mailpitBaseUrl()}/api/v1/messages`);
  if (!response.ok()) {
    return [];
  }
  const body = (await response.json()) as {
    messages?: Array<{ To?: Array<{ Address?: string }>; ToHTML?: string; Subject?: string }>;
  };
  return (body.messages ?? []).flatMap((message) => {
    const structured = (message.To ?? []).map((recipient) => recipient.Address).filter(Boolean) as string[];
    return structured.length > 0 ? structured : message.ToHTML ? [message.ToHTML] : [];
  });
}

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
