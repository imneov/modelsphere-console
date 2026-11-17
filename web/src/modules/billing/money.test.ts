import { describe, expect, it } from "vitest";
import {
  formatMoney,
  isPositiveMoney,
  parseMoney,
} from "@/modules/billing/money";

describe("wallet money at the form boundary", () => {
  it("preserves fractional nanounits and amounts beyond JavaScript integer precision", () => {
    expect(parseMoney("2.000000001")).toBe("2000000001");
    expect(parseMoney("9007199.254740993")).toBe("9007199254740993");
    expect(formatMoney("-1850000", "USD")).toBe("USD -0.00185");
    expect(formatMoney("1034344500000", "USD")).toBe("USD 1,034.3445");
  });
  it("rejects rounding, exponent notation and storage overflow", () => {
    for (const value of [
      "0.0000000001",
      "1e3",
      "NaN",
      "9223372036.854775808",
    ]) {
      expect(() => parseMoney(value)).toThrow();
    }
  });
  it("renders unreadable amounts as a dash instead of throwing during render", () => {
    for (const value of ["", "abc", "1.5", "0x10", "  "]) {
      expect(formatMoney(value, "USD")).toBe("—");
    }
  });
  it("detects positive amounts without parsing the value twice", () => {
    expect(isPositiveMoney("1")).toBe(true);
    expect(isPositiveMoney("0")).toBe(false);
    expect(isPositiveMoney("-1850000")).toBe(false);
    expect(isPositiveMoney("not-a-number")).toBe(false);
  });
});
