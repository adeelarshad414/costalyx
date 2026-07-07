import { expect, test } from '@playwright/test';
import { capturePersonaEvidence, hasKeycloakCredentials, personaSkipReason, signInAsAdmin } from './support/persona-helpers';

test.describe('Settings preferences', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('persists display preferences from a real authenticated settings surface', async ({ page }, testInfo) => {
    await signInAsAdmin(page);

    const navigation = page.getByRole('navigation', { name: 'Product sections' });
    await expect(navigation.getByRole('link', { name: 'Settings' })).toBeVisible();
    await navigation.getByRole('link', { name: 'Settings' }).click();

    const settings = page.getByRole('region', { name: 'Settings', exact: true });
    await expect(settings).toBeInViewport();
    await expect(settings.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(settings.getByRole('group', { name: 'Theme' })).toBeVisible();
    await expect(settings.getByRole('group', { name: 'Density' })).toBeVisible();

    await settings.getByRole('button', { name: 'Compact' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    expect(await page.evaluate(() => window.localStorage.getItem('costalyx-density'))).toBe('compact');

    await settings.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => window.localStorage.getItem('costalyx-theme'))).toBe('light');

    await expect(settings).not.toContainText(/token|refresh|403|Unauthorized|Forbidden|stack|authorization/i);
    await capturePersonaEvidence(page, testInfo, 'settings-preferences');
  });
});
