import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('CFO stakeholder statement persona journey', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('shows an explainable statement narrative with totals and variance warnings', async ({ page }, testInfo) => {
    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    const billing = page.getByRole('region', { name: 'Billing anomalies' });
    await expect(billing).toContainText('Stakeholder Statements');

    const statement = billing.getByRole('listitem').filter({
      hasText: 'Platform engineering consumed compute across AWS, Azure, and GCP.'
    });
    await expect(statement).toHaveCount(1);
    await expect(statement).toContainText(/Total\s+\$\d+\.\d{2}/);
    await expect(statement).toContainText(/Warnings\s+\d+/);

    await capturePersonaEvidence(page, testInfo, 'cfo-statement-narrative');
  });
});
