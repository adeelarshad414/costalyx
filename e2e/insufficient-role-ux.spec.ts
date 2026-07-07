import { expect, test } from '@playwright/test';
import { capturePersonaEvidence, hasKeycloakCredentials, personaSkipReason, signInAsSeededUser } from './support/persona-helpers';

const seededRoles = (process.env.E2E_KEYCLOAK_ROLE ?? 'admin')
  .split(',')
  .map((role) => role.trim());
const hasViewerOnlyRole = seededRoles.length === 1 && seededRoles[0] === 'viewer';

test.describe('Insufficient-role UX', () => {
  test.setTimeout(120000);
  test.skip(!hasKeycloakCredentials, personaSkipReason());
  test.skip(!hasViewerOnlyRole, 'E2E_KEYCLOAK_ROLE=viewer is required for viewer-only permission UX proof.');

  test('shows a polished viewer scope while hiding privileged admin and analyst actions', async ({ page }, testInfo) => {
    await signInAsSeededUser(page);

    await expect(page.getByText('viewer').first()).toBeVisible();
    const accessScope = page.getByRole('region', { name: 'Access scope' });
    await expect(accessScope).toBeVisible();
    await expect(accessScope.getByRole('heading', { name: 'Viewer access' })).toBeVisible();
    await expect(accessScope).toContainText('Read-only mode');
    await expect(accessScope).toContainText('Analyst and admin actions stay hidden');

    const nav = page.getByRole('navigation', { name: 'Product sections' });
    await expect(nav).toBeVisible();
    await expect(nav).not.toContainText('Operator');
    await expect(page.getByRole('region', { name: 'Cloud portfolio' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Normalized cost records' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run ingestion' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Apply recommendation' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Operator readiness' })).toHaveCount(0);
    await expect(page.getByText(/403|Unauthorized|Forbidden|stack|token/i)).toHaveCount(0);

    await capturePersonaEvidence(page, testInfo, 'insufficient-role-viewer-scope');
  });
});
