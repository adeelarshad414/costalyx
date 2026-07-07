import { describe, expect, it } from 'vitest';
import { toUserFacingError } from './userFacingError';

describe('toUserFacingError', () => {
  it('replaces raw API, stack, and credential-shaped details with useful product copy', () => {
    const rawError = new Error(
      'HTTP 500 {"type":"https://api.costalyx.local/errors/internal","detail":"Query failed: access_token=secret stack=at CostRepository.find"}'
    );

    expect(toUserFacingError(rawError, 'Load the cloud portfolio')).toBe(
      'Load the cloud portfolio failed. Try again or contact an administrator if this keeps happening.'
    );
  });

  it('keeps short curated recovery guidance intact', () => {
    expect(toUserFacingError('Use another provider or run ingestion.', 'Load insights')).toBe('Use another provider or run ingestion.');
  });
});
