import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('IT manager showback scopes persona journey', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('shows account groups, allocation state, and visible unallocated statement warnings', async ({ page }, testInfo) => {
    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    const portfolio = page.getByRole('region', { name: 'Portfolio rollup' });
    await expect(portfolio).toContainText('Groups');
    await expect(portfolio).toContainText('3');

    const allocation = page.getByRole('region', { name: 'Allocation and dynamic tagging' });
    await expect(allocation).toBeVisible({ timeout: 45000 });
    const aggregate = allocation.getByRole('region', { name: 'Dimension aggregate' });
    await expect(aggregate).toBeVisible({ timeout: 45000 });
    await expect(aggregate).toContainText('Untagged', { timeout: 45000 });

    const billing = page.getByRole('region', { name: 'Billing anomalies' });
    await expect(billing).toContainText('Data Platform');
    await expect(billing).toContainText(/Warnings\s+\d+/);

    await capturePersonaEvidence(page, testInfo, 'it-manager-showback-scopes');
  });
});
