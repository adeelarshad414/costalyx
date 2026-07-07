import { expect, test } from '@playwright/test';
import { capturePersonaEvidence, hasKeycloakCredentials, personaSkipReason, signInAsAdmin } from './support/persona-helpers';

test.describe('Operator readiness console', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('surfaces sanitized go-live readiness from the authenticated app shell', async ({ page }, testInfo) => {
    await signInAsAdmin(page);

    const navigation = page.getByRole('navigation', { name: 'Product sections' });
    await navigation.getByRole('link', { name: 'Operator' }).click();

    const operator = page.getByRole('region', { name: 'Operational readiness' });
    await expect(operator).toBeInViewport();
    await expect(operator.getByRole('heading', { name: 'Operational readiness' })).toBeVisible();
    await expect(operator.getByText('USE_MOCKS disabled')).toBeVisible();
    await expect(operator.getByText('Live cloud probes')).toBeVisible();
    await expect(operator.getByText('AWS broker principal')).toBeVisible();
    await expect(operator.getByText('npm run probe:live-readiness')).toBeVisible();

    const operatorText = await operator.textContent();
    expect(operatorText).not.toMatch(/secretAccessKey|accessKeyId|clientSecret|password|vault-root-token|arn:aws/i);

    await capturePersonaEvidence(page, testInfo, 'operator-readiness-console');
  });
});
