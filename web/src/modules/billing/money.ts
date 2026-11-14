const SCALE = 1_000_000_000n;
const MAX_AMOUNT = 9_223_372_036_854_775_807n;

export function parseMoney(value: string): string {
  const normalized = value.trim();
  if (!/^-?\d+(?:\.\d{1,9})?$/.test(normalized))
    throw new Error("invalid decimal amount");
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace(/^-/, "").split(".");
  const unsigned = BigInt(whole) * SCALE + BigInt(fraction.padEnd(9, "0"));
  const amount = negative ? -unsigned : unsigned;
  if (amount > MAX_AMOUNT || amount < -MAX_AMOUNT - 1n)
    throw new Error("amount overflows");
  return amount.toString();
}

export function formatMoney(amount: string, currency: string): string {
  const value = BigInt(amount);
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const fraction = (magnitude % SCALE)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${currency} ${negative ? "-" : ""}${magnitude / SCALE}.${fraction}`;
}
