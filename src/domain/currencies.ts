export const supportedCurrencies = ["KZT", "USD", "RUB", "CNY", "UZS"] as const;

export type SupportedCurrency = (typeof supportedCurrencies)[number];

export const currencyLabels: Record<SupportedCurrency, string> = {
  KZT: "KZT — казахстанский тенге",
  USD: "USD — доллар США",
  RUB: "RUB — российский рубль",
  CNY: "CNY — китайский юань",
  UZS: "UZS — узбекский сум",
};

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return supportedCurrencies.includes(value as SupportedCurrency);
}
