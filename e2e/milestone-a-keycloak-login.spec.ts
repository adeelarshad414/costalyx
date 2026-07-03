import { expect, test } from '@playwright/test';

const hasKeycloakCredentials = Boolean(process.env.E2E_KEYCLOAK_USERNAME && process.env.E2E_KEYCLOAK_PASSWORD);

test.describe('Milestone A Keycloak login', () => {
  test.skip(!hasKeycloakCredentials, 'E2E_KEYCLOAK_USERNAME and E2E_KEYCLOAK_PASSWORD are required.');

  test('authenticates through the live Keycloak login redirect', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/auth|\/realms\/costalyx-dev/);

    await page.getByLabel(/username|email/i).fill(process.env.E2E_KEYCLOAK_USERNAME ?? '');
    await page.getByLabel(/password/i).fill(process.env.E2E_KEYCLOAK_PASSWORD ?? '');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const recordsTable = page.getByRole('table');
    if (!(await recordsTable.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Run ingestion' }).click();
    }
    await expect(recordsTable).toBeVisible();
  });
});
