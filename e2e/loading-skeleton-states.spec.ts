import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('Loading skeleton micro-states', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('shows a shape-matched table skeleton while cost records load', async ({ page }, testInfo) => {
    let releaseCostRecords: (() => void) | undefined;
    const heldCostRecords = new Promise<void>((resolve) => {
      releaseCostRecords = resolve;
    });

    await page.route(/\/api\/v1\/cost-records(?:\?|$)/, async (route) => {
      if (route.request().method() === 'GET') {
        await heldCostRecords;
      }
      await route.continue();
    });

    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    const loadingStatus = page.getByRole('status', { name: 'Loading cost records' });
    await expect(loadingStatus).toBeVisible();
    await expect(loadingStatus).toHaveAttribute('aria-busy', 'true');
    await expect(loadingStatus.getByTestId('loading-skeleton')).toHaveAttribute('data-variant', 'table');
    await expect(loadingStatus.getByTestId('skeleton-table-row')).toHaveCount(5);
    await capturePersonaEvidence(page, testInfo, 'loading-skeleton-states');

    releaseCostRecords?.();
    await expect(page.getByRole('region', { name: 'Normalized cost records' }).getByRole('table')).toBeVisible({
      timeout: 30000
    });
  });
});
