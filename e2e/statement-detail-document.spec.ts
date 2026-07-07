import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('Stakeholder statement detail document', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('opens a CFO-forwardable statement with line items, reconciliation, and review context', async ({ page }, testInfo) => {
    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    const billing = page.getByRole('region', { name: 'Billing anomalies' });
    const statement = billing.getByRole('listitem').filter({
      hasText: 'Platform engineering consumed compute across AWS, Azure, and GCP.'
    });
    await expect(statement).toHaveCount(1);
    await statement.getByRole('button', { name: 'Review statement for Platform Engineering' }).click();

    const detail = billing.getByRole('region', { name: 'Forwardable statement' });
    await expect(detail.getByRole('heading', { name: 'Platform Engineering' })).toBeVisible();
    await expect(detail.getByRole('table', { name: 'Statement line items' })).toBeVisible();
    await expect(detail.getByRole('table', { name: 'Statement reconciliation' })).toBeVisible();
    await expect(detail).toContainText('Scope warnings');
    await expect(detail).toContainText('Variance movers');
    await expect(detail).toContainText('Open anomalies');
    await expect(detail).toContainText(/Export\s+CSV/);
    await expectNoUserVisibleFailures(page);

    await capturePersonaEvidence(page, testInfo, 'statement-detail-document');
  });
});
