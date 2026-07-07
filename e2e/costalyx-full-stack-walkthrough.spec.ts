import { expect, type Page, test } from '@playwright/test';

const hasKeycloakCredentials = Boolean(process.env.E2E_KEYCLOAK_USERNAME && process.env.E2E_KEYCLOAK_PASSWORD);

test.describe('Costalyx full-stack walkthrough', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180000);
  test.skip(!hasKeycloakCredentials, 'E2E_KEYCLOAK_USERNAME and E2E_KEYCLOAK_PASSWORD are required.');

  test('renders every milestone surface with live auth and seeded data', async ({ page }) => {
    await signIn(page);

    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByText(/Could not load|Could not initialize|Access restricted/)).toHaveCount(0);

    const regions = [
      'Cloud portfolio',
      'Normalized cost records',
      'Executive summary',
      'Resource inventory and cost explorer',
      'Optimization recommendations',
      'Billing anomalies',
      'Reporting and saved views',
      'Allocation and dynamic tagging',
      'Access and trust controls'
    ];

    for (const region of regions) {
      await expect(page.getByRole('region', { name: region })).toBeVisible({ timeout: 45000 });
    }

    await expect(page.getByRole('region', { name: 'Portfolio rollup' })).toContainText(/AWS|Azure|GCP/);
    await expect(page.getByRole('region', { name: 'Normalized cost records' }).getByRole('table')).toContainText(
      /aws|azure|gcp/i
    );
    await expect(page.getByRole('region', { name: 'Executive summary' })).toContainText(/spend|forecast|variance/i);
    await expect(page.getByRole('region', { name: 'Resource Inventory' }).getByRole('table')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cost Explorer', exact: true })).toContainText(/Cost floor|Flow/);
    await expect(page.getByRole('region', { name: 'Billing anomalies' })).toContainText(/Stakeholder Statements|Agent Runs/);
    await expect(page.getByRole('region', { name: 'Fixed role inventory' })).toContainText(/admin|viewer/i);

    await page.getByRole('button', { name: 'Estimate TCO' }).click();
    await expect(page.getByRole('region', { name: 'What-if TCO' })).toContainText(/AWS|Azure|GCP/);

    await page.getByRole('button', { name: 'Run Cost Detail' }).click();
    await expect(page.getByRole('region', { name: 'Report Result' }).getByRole('table')).toBeVisible();

    await expectNoViewportOverflow(page);
    expect(consoleErrors).toEqual([]);
  });

  for (const viewport of [
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 }
  ]) {
    test(`keeps the authenticated shell usable on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page);

      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Cloud portfolio' })).toBeVisible({ timeout: 45000 });
      await expect(page.getByRole('region', { name: 'Normalized cost records' })).toBeVisible({ timeout: 45000 });
      await expectNoViewportOverflow(page);
    });
  }
});

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/protocol\/openid-connect\/auth|\/realms\/costalyx-dev/, { timeout: 90000 });
  await page.getByLabel(/username|email/i).fill(process.env.E2E_KEYCLOAK_USERNAME ?? '');
  await page.getByRole('textbox', { name: /^password$/i }).fill(process.env.E2E_KEYCLOAK_PASSWORD ?? '');
  await page.getByRole('button', { name: /sign in/i }).click();
}

async function expectNoViewportOverflow(page: Page) {
  const audit = await page.evaluate(() => {
    const clippedButtons = Array.from(document.querySelectorAll('button'))
      .filter((button) => button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1)
      .map((button) => button.textContent?.trim() ?? '');

    const offenders = Array.from(document.body.querySelectorAll('*'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            className: element.getAttribute('class') ?? '',
            text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
            overflow: Math.ceil(rect.right - document.documentElement.clientWidth),
            width: Math.ceil(rect.width)
          };
        })
        .filter((element) => element.overflow > 1)
        .sort((left, right) => right.overflow - left.overflow)
        .slice(0, 8);

    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      maxElementOverflow: offenders[0]?.overflow ?? 0,
      clippedButtons,
      offenders
    };
  });

  expect(audit.maxElementOverflow, JSON.stringify(audit, null, 2)).toBeLessThanOrEqual(1);
  expect(audit.clippedButtons).toEqual([]);
}
