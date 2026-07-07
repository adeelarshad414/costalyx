import { expect, test } from '@playwright/test';
import { capturePersonaEvidence, hasKeycloakCredentials, personaSkipReason, signInAsAdmin } from './support/persona-helpers';

test.describe('Auth session lifecycle', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('lets an authenticated user sign out and returns to the protected sign-in state', async ({ page }, testInfo) => {
    await signInAsAdmin(page);

    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 45000 });
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Product sections' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Cloud portfolio' })).toHaveCount(0);

    await capturePersonaEvidence(page, testInfo, 'auth-session-logout');
  });
});
