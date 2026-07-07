import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('Anomaly detail evidence story', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('opens a readable what-changed, impact, and action panel from the anomaly queue', async ({ page }, testInfo) => {
    await signInAsAdmin(page, '/billing-agent');
    await expectNoUserVisibleFailures(page);

    const billing = page.getByRole('region', { name: 'Billing anomalies' });
    await billing.getByRole('button', { name: 'Run scan' }).click();
    const usageEvidence = billing.getByRole('button', { name: 'Review evidence for Usage' });
    await expect(usageEvidence).toBeVisible();
    await usageEvidence.click();

    const story = billing.getByRole('region', { name: 'Anomaly evidence story' });
    await expect(story).toContainText('What changed');
    await expect(story).toContainText('Since when');
    await expect(story).toContainText('Impact');
    await expect(story).toContainText('Recommended action');
    await expect.poll(async () => story.locator('.font-mono-data').filter({ hasText: /\$[0-9]+\.[0-9]{2}/ }).count()).toBeGreaterThan(0);
    await expect(story.getByRole('button', { name: 'Close anomaly detail' })).toBeVisible();
    await expect(page.getByText(/HTTP 500|Unauthorized|access_token|stack=/i)).toHaveCount(0);

    await capturePersonaEvidence(page, testInfo, 'anomaly-detail-story');
  });
});
