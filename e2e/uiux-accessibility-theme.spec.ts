import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  capturePersonaEvidence,
  expectNoUserVisibleFailures,
  hasKeycloakCredentials,
  personaSkipReason,
  signInAsAdmin
} from './support/persona-helpers';

test.describe('UIUX accessibility and theme elevation', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());

  test('passes WCAG AA scans in dark and light themes', async ({ page }, testInfo) => {
    await signInAsAdmin(page);
    await expectNoUserVisibleFailures(page);

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
    await expectNoAxeViolations(page);
    await capturePersonaEvidence(page, testInfo, 'uiux-accessibility-dark');

    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
    await expectNoAxeViolations(page);
    await capturePersonaEvidence(page, testInfo, 'uiux-accessibility-light');
  });

  test('keeps app-shell controls keyboard reachable with visible focus and reduced motion respected', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInAsAdmin(page);

    const themeToggle = page.getByRole('button', { name: 'Switch to light theme' });
    await focusByKeyboard(page, themeToggle);
    await expectVisibleFocus(page);

    const signOut = page.getByRole('button', { name: 'Sign out' });
    await focusByKeyboard(page, signOut);
    await expectVisibleFocus(page);

    const reducedMotion = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const transitionDuration = await themeToggle.evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(reducedMotion).toBe(true);
    expect(maxTransitionMs(transitionDuration)).toBeLessThanOrEqual(0.01);
  });
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
}

async function focusByKeyboard(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await target.evaluate((element) => document.activeElement === element).catch(() => false)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function expectVisibleFocus(page: Page) {
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) {
      return { outlineStyle: 'none', outlineWidth: '0px' };
    }
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth
    };
  });

  expect(focus.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThan(0);
}

function maxTransitionMs(value: string): number {
  return Math.max(
    ...value.split(',').map((part) => {
      const duration = part.trim();
      if (duration.endsWith('ms')) {
        return Number.parseFloat(duration);
      }
      if (duration.endsWith('s')) {
        return Number.parseFloat(duration) * 1000;
      }
      return Number.parseFloat(duration) || 0;
    })
  );
}
