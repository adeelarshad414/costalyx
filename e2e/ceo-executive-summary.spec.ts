import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsSeededUser
} from './support/persona-helpers';

test.describe('CEO executive summary persona journey', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('answers what are we spending and why within the seeded dashboard', async ({ page }, testInfo) => {
    await signInAsSeededUser(page, '/executive');

    const startedAt = Date.now();
    const executive = page.getByRole('region', { name: 'Executive summary' });
    await expect(executive).toBeVisible({ timeout: 30000 });
    await expectNoUserVisibleFailures(page);
    await expect(executive).toContainText('Total spend');
    await expect(executive).toContainText('Budget used');
    await expect(executive).toContainText('Trend delta');
    await expect(executive.getByRole('region', { name: 'Top Movers' })).toContainText(/Amazon|Azure|Compute|BigQuery/);

    expect(Date.now() - startedAt).toBeLessThan(30000);
    await capturePersonaEvidence(page, testInfo, 'ceo-executive-summary');
  });
});
