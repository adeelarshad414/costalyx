import { formatDecimal, multiplyMoney, roundMoneyToCent } from '../../src/cost-model/decimal';

describe('decimal utilities', () => {
  it('multiplies hourly_rate_usd by usage_hours without storing cached totals', () => {
    expect(multiplyMoney('0.06800000', '730.0000')).toBe('49.64000000');
  });

  it('rounds computed money to the cent for golden fixture comparison', () => {
    expect(roundMoneyToCent('0.41600000')).toBe('0.42');
  });

  it('normalizes numeric input to the requested fixed scale', () => {
    expect(formatDecimal('0.005', 8)).toBe('0.00500000');
  });

  it('handles signed integer-like decimal strings without floating drift', () => {
    expect(multiplyMoney('-1', '2')).toBe('-2.00000000');
  });

  it('handles leading-decimal values by normalizing the empty whole segment', () => {
    expect(multiplyMoney('.5', '1')).toBe('0.50000000');
  });
});
