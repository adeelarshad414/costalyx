import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const username = process.env.E2E_KEYCLOAK_USERNAME;
const password = process.env.E2E_KEYCLOAK_PASSWORD;
const outputDir = path.resolve(process.env.THEME_SCREENSHOT_DIR ?? 'artifacts/theme-audit/2026-07-07');

const modes = ['dark', 'light'];
const accents = ['default', 'terracotta'];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 }
];

if (!username || !password) {
  console.error('E2E_KEYCLOAK_USERNAME and E2E_KEYCLOAK_PASSWORD are required.');
  process.exit(2);
}

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: viewports[0] });
const screenshots = [];

try {
  await signIn(page);

  for (const mode of modes) {
    for (const accent of accents) {
      await page.evaluate(
        ({ nextMode, nextAccent }) => {
          window.localStorage.setItem('costalyx-theme', nextMode);
          window.localStorage.setItem('costalyx-accent', nextAccent);
          document.documentElement.dataset.themePreference = nextMode;
          document.documentElement.dataset.theme = nextMode;
          document.documentElement.dataset.accent = nextAccent;
        },
        { nextMode: mode, nextAccent: accent }
      );

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole('navigation', { name: 'Product sections' }).waitFor({ state: 'visible' });
        const fileName = `costalyx-${mode}-${accent}-${viewport.name}.png`;
        const filePath = path.join(outputDir, fileName);
        await page.screenshot({ path: filePath, fullPage: true });
        screenshots.push({
          mode,
          accent,
          viewport: viewport.name,
          width: viewport.width,
          height: viewport.height,
          path: path.relative(process.cwd(), filePath)
        });
      }
    }
  }
} finally {
  await browser.close();
}

await writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify({ baseUrl, screenshots }, null, 2)}\n`);
console.log(`Captured ${screenshots.length} theme screenshots in ${path.relative(process.cwd(), outputDir)}.`);

async function signIn(page) {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/protocol\/openid-connect\/auth|\/realms\/costalyx-dev/, { timeout: 90000 });
  await page.getByLabel(/username|email/i).fill(username);
  await page.getByRole('textbox', { name: /^password$/i }).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('button', { name: 'Sign out' }).waitFor({ state: 'visible', timeout: 45000 });
  await page.getByRole('region', { name: 'Cloud portfolio' }).waitFor({ state: 'visible', timeout: 45000 });
}
