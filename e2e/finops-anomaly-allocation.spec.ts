import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('FinOps practitioner anomaly and allocation persona journey', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('triages billing anomalies and confirms allocation coverage without leaving the app', async ({ page }, testInfo) => {
    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    const billing = page.getByRole('region', { name: 'Billing anomalies' });
    await billing.getByRole('button', { name: 'Run scan' }).click();
    await expect(billing).toContainText(/Coverage|New Spend|Unit Price|Usage/);
    await expect.poll(async () => billing.getByLabel(/False positive reason/).count()).toBeGreaterThan(0);

    const allocation = page.getByRole('region', { name: 'Allocation and dynamic tagging' });
    await expect(allocation.getByRole('region', { name: 'Custom dimensions' })).toContainText(/Cost Center|Environment/);
    await expect(allocation.getByRole('region', { name: 'Dimension aggregate' })).toContainText('Untagged');
    await expect(allocation.getByRole('button', { name: 'Retag resource' })).toBeEnabled();

    await capturePersonaEvidence(page, testInfo, 'finops-anomaly-allocation');
  });
});
