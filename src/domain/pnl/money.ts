export type Currency = "KZT" | "RUB" | "USD" | "EUR" | string;

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}

export function money(amountMinor: bigint, currency: Currency = "KZT"): Money {
  return { amountMinor, currency };
}

export function assertSameCurrency(values: readonly Money[]): Currency {
  const currency = values[0]?.currency ?? "KZT";
  if (values.some((value) => value.currency !== currency)) throw new Error("CURRENCY_MISMATCH");
  return currency;
}

export function sumMoney(values: readonly Money[], fallbackCurrency = "KZT"): Money {
  if (values.length === 0) return money(0n, fallbackCurrency);
  const currency = assertSameCurrency(values);
  return money(values.reduce((total, value) => total + value.amountMinor, 0n), currency);
}

export function multiplyRate(valueMinor: bigint, basisPoints: number): bigint {
  if (!Number.isInteger(basisPoints)) throw new Error("INVALID_BASIS_POINTS");
  return (valueMinor * BigInt(basisPoints)) / 10_000n;
}

export function divideMinorByKm(valueMinor: bigint, km: number): bigint | null {
  if (!Number.isInteger(km) || km <= 0) return null;
  return valueMinor / BigInt(km);
}
