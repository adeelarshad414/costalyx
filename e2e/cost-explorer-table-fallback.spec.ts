import { expect, test } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('Cost Explorer table fallback', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('makes the Explorer flow available as a keyboard-reachable table', async ({ page }, testInfo) => {
    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    const explorer = page.getByRole('region', { name: 'Cost Explorer', exact: true });
    await expect(explorer).toContainText('Cost floor');
    const tableToggle = explorer.getByRole('button', { name: 'View as table' });
    await expect(tableToggle).toBeVisible({ timeout: 10000 });
    await tableToggle.click();

    const table = explorer.getByRole('table', { name: 'Cost Explorer flow table' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Source' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Target' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Cost' })).toBeVisible();
    const awsOnDemandRow = table.getByRole('row', { name: /Amazon EC2.*on_demand.*USD \d+\.\d{8}/ });
    await expect(awsOnDemandRow).toBeVisible();

    const costCell = awsOnDemandRow.getByRole('cell', { name: /^USD \d+\.\d{8}$/ });
    await expect(costCell).toBeVisible();
    await expect(costCell).toHaveCSS('text-align', 'right');
    await expect(costCell).toHaveCSS('font-variant-numeric', /tabular-nums/);

    await explorer.getByRole('button', { name: 'View as flow' }).click();
    await expect(table).toHaveCount(0);
    await expect(explorer.getByRole('list')).toBeVisible();

    await capturePersonaEvidence(page, testInfo, 'cost-explorer-table-fallback');
  });
});
