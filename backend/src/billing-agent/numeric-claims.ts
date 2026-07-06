export interface NumericClaimValidation {
  valid: boolean;
  missing: string[];
  unexpected: string[];
}

const claimPattern = /(?:\$[0-9]+(?:\.[0-9]{2,8})?|[0-9]+(?:\.[0-9]+)?%|[0-9]+(?:\.[0-9]+)? hours)/g;

export function validateNumericClaims(explanationMd: string, expectedClaims: string[]): NumericClaimValidation {
  const actual = [...new Set(explanationMd.match(claimPattern) ?? [])].sort();
  const expected = [...new Set(expectedClaims)].sort();
  const missing = expected.filter((claim) => !actual.includes(claim));
  const unexpected = actual.filter((claim) => !expected.includes(claim));
  return {
    valid: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected
  };
}

export function assertValidNumericClaims(explanationMd: string, expectedClaims: string[]): void {
  const result = validateNumericClaims(explanationMd, expectedClaims);
  if (!result.valid) {
    throw new Error(
      `Narrative numeric claims failed validation. Missing: ${result.missing.join(', ') || 'none'}. Unexpected: ${
        result.unexpected.join(', ') || 'none'
      }.`
    );
  }
}
