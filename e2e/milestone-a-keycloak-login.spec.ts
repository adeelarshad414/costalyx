import { expect, test } from '@playwright/test';

const hasKeycloakCredentials = Boolean(process.env.E2E_KEYCLOAK_USERNAME && process.env.E2E_KEYCLOAK_PASSWORD);

test.describe('Milestone A Keycloak login', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, 'E2E_KEYCLOAK_USERNAME and E2E_KEYCLOAK_PASSWORD are required.');

  test('authenticates through the live Keycloak login redirect', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/protocol\/openid-connect\/auth|\/realms\/costalyx-dev/, { timeout: 90000 });

    await page.getByLabel(/username|email/i).fill(process.env.E2E_KEYCLOAK_USERNAME ?? '');
    await page.getByRole('textbox', { name: /^password$/i }).fill(process.env.E2E_KEYCLOAK_PASSWORD ?? '');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 45000 });
    const recordsTable = page.getByRole('region', { name: 'Normalized cost records' }).getByRole('table');
    if (!(await recordsTable.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Run ingestion' }).click();
    }
    await expect(recordsTable).toBeVisible({ timeout: 45000 });
  });
});
