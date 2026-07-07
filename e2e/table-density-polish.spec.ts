import { expect, test, type Locator } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('Table density polish', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('keeps cost tables scannable with sticky headers, hover feedback, and aligned numerics', async ({ page }, testInfo) => {
    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    const recordsTable = page.getByRole('region', { name: 'Normalized cost records' }).getByRole('table');
    await expect(recordsTable).toBeVisible();

    await expectStickyHeaders(recordsTable);
    const seededAwsRow = recordsTable.getByRole('row', { name: /i-aws-prod-001.*30\.36800000/ });
    await expectRowHoverFeedback(seededAwsRow);
    await expectRightAlignedTabularCost(seededAwsRow);
    await capturePersonaEvidence(page, testInfo, 'table-density-polish');
  });
});

async function expectStickyHeaders(table: Locator) {
  const positions = await table.getByRole('columnheader').evaluateAll((headers) =>
    headers.map((header) => getComputedStyle(header).position)
  );
  expect(positions.length).toBeGreaterThan(0);
  expect(positions.every((position) => position === 'sticky')).toBe(true);
}

async function expectRowHoverFeedback(row: Locator) {
  const before = await row.evaluate((element) => getComputedStyle(element).backgroundColor);
  await row.hover();
  const after = await row.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(after).not.toBe(before);
}

async function expectRightAlignedTabularCost(row: Locator) {
  const costCell = row.getByRole('cell', { name: '30.36800000' });
  const style = await costCell.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      fontFamily: computed.fontFamily,
      fontVariantNumeric: computed.fontVariantNumeric,
      textAlign: computed.textAlign
    };
  });

  expect(style.fontFamily).toContain('JetBrains Mono');
  expect(style.fontVariantNumeric).toContain('tabular-nums');
  expect(style.textAlign).toBe('right');
}
