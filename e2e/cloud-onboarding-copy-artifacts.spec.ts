import { expect, test } from '@playwright/test';
import { hasKeycloakCredentials, personaSkipReason, signInAsAdmin } from './support/persona-helpers';

test.describe('Cloud onboarding copy artifacts', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('lets an admin copy readonly onboarding values from the live portfolio UI', async ({ context, page }, testInfo) => {
    const appOrigin = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:5173').origin;
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: appOrigin });
    await signInAsAdmin(page);

    const portfolio = page.getByRole('region', { name: 'Cloud portfolio' });
    await portfolio.getByRole('combobox', { name: /^Connection$/ }).selectOption({ label: 'AWS Production Billing' });

    await portfolio.getByRole('button', { name: 'Copy External ID' }).click();
    await expect(page.getByRole('status', { name: 'Onboarding copy status' })).toContainText('Copied External ID');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('costalyx:');

    await portfolio.getByRole('button', { name: 'Load policies' }).click();
    const onboarding = page.getByRole('region', { name: 'AWS onboarding' });
    await expect(onboarding.getByRole('button', { name: 'Copy Permissions policy' })).toBeVisible({ timeout: 30000 });

    await onboarding.getByRole('button', { name: 'Copy Permissions policy' }).click();
    await expect(page.getByRole('status', { name: 'Onboarding copy status' })).toContainText('Copied Permissions policy');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('CostalyxReadBillingExportObjects');

    await page.screenshot({ path: testInfo.outputPath('cloud-onboarding-copy-artifacts.png'), fullPage: true });
  });
});
