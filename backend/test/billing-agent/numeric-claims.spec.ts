import { assertValidNumericClaims, validateNumericClaims } from '../../src/billing-agent/numeric-claims';

describe('billing-agent numeric claim validation', () => {
  it('accepts exact money, percent, and usage-hour claims', () => {
    expect(validateNumericClaims('Usage reached 50.0000 hours, 500.00% of median 10.0000 hours and $36.50000000.', [
      '50.0000 hours',
      '500.00%',
      '10.0000 hours',
      '$36.50000000'
    ])).toEqual({
      valid: true,
      missing: [],
      unexpected: []
    });
  });

  it('accepts narratives with no numeric claims when no computed claims were supplied', () => {
    expect(validateNumericClaims('No numeric claims in this deterministic fallback.', [])).toEqual({
      valid: true,
      missing: [],
      unexpected: []
    });
  });

  it('reports expected claims that are missing from the narrative', () => {
    expect(validateNumericClaims('Projected impact is $36.50000000.', ['$36.50000000', '50.00%'])).toEqual({
      valid: false,
      missing: ['50.00%'],
      unexpected: []
    });
  });

  it('reports unexpected claims that were not deterministically supplied', () => {
    expect(validateNumericClaims('Projected impact is $36.50000000 and 50.00%.', ['$36.50000000'])).toEqual({
      valid: false,
      missing: [],
      unexpected: ['50.00%']
    });
  });

  it('throws before persisting narratives with unverified numeric claims', () => {
    expect(() => assertValidNumericClaims('Projected impact is $36.50000000 and 50.00%.', ['$36.50000000'])).toThrow(
      /Unexpected: 50.00%/
    );
  });

  it('spells out missing-only failures without inventing unexpected claims', () => {
    expect(() => assertValidNumericClaims('Projected impact is $36.50000000.', ['$36.50000000', '50.00%'])).toThrow(
      /Missing: 50.00%. Unexpected: none/
    );
  });
});
