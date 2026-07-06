function decimalToScaledInt(value: string, scale: number): bigint {
  const normalized = value.trim();
  const [wholeRaw, fractionRaw = ''] = normalized.split('.');
  const sign = wholeRaw.startsWith('-') ? -1n : 1n;
  const whole = wholeRaw.replace('-', '') || '0';
  const fraction = `${fractionRaw}${'0'.repeat(scale)}`.slice(0, scale);
  return sign * BigInt(`${whole}${fraction}`);
}

function scaledIntToDecimal(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const raw = absolute.toString().padStart(scale + 1, '0');
  return `${sign}${raw.slice(0, -scale)}.${raw.slice(-scale)}`;
}

export function multiplyMoney(rateUsd: string, usageHours: string): string {
  const rate = decimalToScaledInt(rateUsd, 8);
  const usage = decimalToScaledInt(usageHours, 4);
  return scaledIntToDecimal((rate * usage) / 10_000n, 8);
}

export function roundMoneyToCent(value: string): string {
  const cents = (decimalToScaledInt(value, 8) + 500_000n) / 1_000_000n;
  return scaledIntToDecimal(cents, 2);
}

export function formatDecimal(value: string | number, scale: number): string {
  return Number(value).toFixed(scale);
}
