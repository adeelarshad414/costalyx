import { assertNoDummyValuesInNonLocalEnvironment } from '../../src/config/startup-secrets';

describe('assertNoDummyValuesInNonLocalEnvironment', () => {
  it('allows local development to use clearly labeled dummy values', () => {
    expect(() =>
      assertNoDummyValuesInNonLocalEnvironment({
        APP_ENV: 'local',
        DATABASE_URL: 'postgresql://costalyx:CHANGE_ME_DEV_ONLY@localhost:5432/costalyx_dev',
        VAULT_TOKEN: 'CHANGE_ME_DEV_ONLY'
      })
    ).not.toThrow();
  });

  it('rejects CHANGE_ME_DEV_ONLY values in an explicit production environment', () => {
    expect(() =>
      assertNoDummyValuesInNonLocalEnvironment({
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://costalyx:CHANGE_ME_DEV_ONLY@postgres:5432/costalyx',
        VAULT_TOKEN: 'CHANGE_ME_DEV_ONLY'
      })
    ).toThrow('Dummy development values are not allowed when APP_ENV=production');
  });

  it('treats NODE_ENV=production as non-local when APP_ENV is unset', () => {
    expect(() =>
      assertNoDummyValuesInNonLocalEnvironment({
        NODE_ENV: 'production',
        KEYCLOAK_ADMIN_PASSWORD: 'CHANGE_ME_DEV_ONLY'
      })
    ).toThrow('KEYCLOAK_ADMIN_PASSWORD');
  });

  it('passes non-local startup when dummy values have been replaced', () => {
    expect(() =>
      assertNoDummyValuesInNonLocalEnvironment({
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://costalyx:${vault:database-password}@postgres:5432/costalyx',
        VAULT_TOKEN: '${vault:runtime-token}'
      })
    ).not.toThrow();
  });
});
