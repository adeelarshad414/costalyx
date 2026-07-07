import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  openProductPage,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('DevOps SRE waste signals persona journey', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('finds idle or spot resource signals and can act on waste recommendations', async ({ page }, testInfo) => {
    await signInAsAdmin(page, '/insights');
    await expectNoUserVisibleFailures(page);

    const insights = page.getByRole('region', { name: 'Resource inventory and cost explorer' });
    await expect(insights.getByRole('region', { name: 'Resource Inventory' })).toContainText(/spot|reserved|on_demand/i);
    await expect(insights.getByRole('region', { name: 'Cost Explorer', exact: true })).toContainText('Cost floor');

    await openProductPage(page, 'Optimization');
    const optimization = page.getByRole('region', { name: 'Optimization recommendations' });
    await expect(optimization.getByRole('region', { name: 'Recommendations' })).toContainText(/\d+\.\d{8}/);
    await expect.poll(async () => optimization.getByRole('button', { name: 'Apply recommendation' }).count()).toBeGreaterThan(0);
    await expect(optimization.getByRole('region', { name: 'Realized Savings' })).toContainText('ingested_billing');

    await capturePersonaEvidence(page, testInfo, 'devops-sre-waste-signals');
  });
});
