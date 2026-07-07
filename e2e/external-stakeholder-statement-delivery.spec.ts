import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  mailpitRecipients,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('External stakeholder statement delivery persona journey', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('receives a human-approved statement through local Mailpit', async ({ page, request }, testInfo) => {
    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    const billing = page.getByRole('region', { name: 'Billing anomalies' });
    const generate = billing.getByRole('button', { name: 'Generate' });
    await generate.click();
    await expect(generate).toBeEnabled({ timeout: 45000 });

    const statement = billing.getByRole('listitem').filter({
      hasText: 'Platform engineering consumed compute across AWS, Azure, and GCP.'
    });
    await expect(statement).toHaveCount(1);
    await expect(statement).toContainText('pending approval', { timeout: 45000 });
    await expect(statement.getByRole('button', { name: 'Approve' })).toBeEnabled();
    await statement.getByRole('button', { name: 'Approve' }).click();
    await expect(statement).toContainText('approved', { timeout: 45000 });
    await expect(statement.getByRole('button', { name: 'Send' })).toBeEnabled();
    await statement.getByRole('button', { name: 'Send' }).click();
    await expect(statement).toContainText('sent', { timeout: 45000 });

    await expect
      .poll(async () => mailpitRecipients(request), {
        message: 'Mailpit should contain the sent Platform Engineering statement',
        timeout: 15000
      })
      .toContain('platform-finance@example.test');

    await capturePersonaEvidence(page, testInfo, 'external-stakeholder-statement-delivery');
  });
});
