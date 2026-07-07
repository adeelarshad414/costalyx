import { expect, test } from '@playwright/test';
import { capturePersonaEvidence, hasKeycloakCredentials, personaSkipReason, signInAsAdmin } from './support/persona-helpers';

const sections = [
  'Cloud portfolio',
  'Costs',
  'Executive',
  'Insights',
  'Optimization',
  'Billing Agent',
  'Reporting',
  'Allocation',
  'Governance',
  'Settings'
];

test.describe('App shell section navigation', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('lets keyboard users jump across dense product sections from a persistent navigation landmark', async ({ page }, testInfo) => {
    await signInAsAdmin(page);

    const navigation = page.getByRole('navigation', { name: 'Product sections' });
    await expect(navigation).toBeVisible();

    for (const section of sections) {
      await expect(navigation.getByRole('link', { name: section })).toBeVisible();
    }

    const costsLink = navigation.getByRole('link', { name: 'Costs' });
    await focusByKeyboard(page, costsLink);
    await expect(costsLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Normalized cost records' })).toBeInViewport();

    await navigation.getByRole('link', { name: 'Billing Agent' }).click();
    await expect(page.getByRole('region', { name: 'Billing anomalies' })).toBeInViewport();

    await expectNoNavOverflow(page);
    await capturePersonaEvidence(page, testInfo, 'app-shell-section-navigation');
  });
});

async function focusByKeyboard(page: import('@playwright/test').Page, target: import('@playwright/test').Locator) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await target.evaluate((element) => document.activeElement === element).catch(() => false)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function expectNoNavOverflow(page: import('@playwright/test').Page) {
  const audit = await page.getByRole('navigation', { name: 'Product sections' }).evaluate((navigation) => ({
    overflowX: navigation.scrollWidth - navigation.clientWidth,
    clippedLinks: Array.from(navigation.querySelectorAll('a'))
      .filter((link) => link.scrollWidth > link.clientWidth + 1 || link.scrollHeight > link.clientHeight + 1)
      .map((link) => link.textContent?.trim() ?? '')
  }));

  expect(audit.overflowX, JSON.stringify(audit, null, 2)).toBeLessThanOrEqual(1);
  expect(audit.clippedLinks).toEqual([]);
}
