const SCALE = 1_000_000_000n;
const MAX_AMOUNT = 9_223_372_036_854_775_807n;
/** Shown instead of a value the ledger cannot represent. */
const UNREADABLE = "—";

/** Integer nanounits, or null for anything that is not an integer string. */
function nanounits(amount: string): bigint | null {
  const normalized = amount.trim();
  return /^-?\d+$/.test(normalized) ? BigInt(normalized) : null;
}

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

// Server data is untrusted: a malformed amount renders as a dash instead of
// throwing inside render and blanking the whole page.
export function moneyDecimal(amount: string): string {
  const value = nanounits(amount);
  if (value === null) return UNREADABLE;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const fraction = (magnitude % SCALE)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${negative ? "-" : ""}${magnitude / SCALE}.${fraction}`;
}

export function formatMoney(amount: string, currency: string): string {
  const decimal = moneyDecimal(amount);
  if (decimal === UNREADABLE) return UNREADABLE;
  const negative = decimal.startsWith("-");
  const [whole, fraction] = decimal.replace(/^-/, "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${negative ? "-" : ""}${grouped}.${fraction}`;
}

/** Whether the amount is a valid value above zero; malformed input is not. */
export function isPositiveMoney(amount: string): boolean {
  const value = nanounits(amount);
  return value !== null && value > 0n;
}
