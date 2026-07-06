const DUMMY_SENTINEL = 'CHANGE_ME_DEV_ONLY';

type EnvironmentMap = Record<string, string | undefined>;

export function assertNoDummyValuesInNonLocalEnvironment(env: EnvironmentMap = process.env): void {
  const appEnv = resolveAppEnvironment(env);
  if (appEnv === 'local') {
    return;
  }

  const offendingKeys = Object.entries(env)
    .filter(([, value]) => typeof value === 'string' && value.includes(DUMMY_SENTINEL))
    .map(([key]) => key)
    .sort();

  if (offendingKeys.length > 0) {
    throw new Error(
      `Dummy development values are not allowed when APP_ENV=${appEnv}. Replace ${offendingKeys.join(
        ', '
      )} before starting Costalyx. See DUMMY-VALUES.md for the go-live swap list.`
    );
  }
}

function resolveAppEnvironment(env: EnvironmentMap): string {
  if (env.APP_ENV?.trim()) {
    return env.APP_ENV.trim().toLowerCase();
  }
  if (env.NODE_ENV?.trim().toLowerCase() === 'production') {
    return 'production';
  }
  return 'local';
}
