import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('Solution architect TCO persona journey', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('compares AWS Azure and GCP using the live pricing model', async ({ page }, testInfo) => {
    await signInAsAdmin(page, '/executive');
    await expectNoUserVisibleFailures(page);

    const executive = page.getByRole('region', { name: 'Executive summary' });
    await executive.getByRole('button', { name: 'Estimate TCO' }).click();

    const tco = executive.getByRole('region', { name: 'What-if TCO' });
    await expect(tco.getByText('AWS')).toBeVisible({ timeout: 45000 });
    await expect(tco).toContainText('Azure');
    await expect(tco).toContainText('GCP');
    await expect(tco).toContainText('Tolerance');
    await expect(tco).toContainText('0.0000%');

    await capturePersonaEvidence(page, testInfo, 'solution-architect-tco');
  });
});
