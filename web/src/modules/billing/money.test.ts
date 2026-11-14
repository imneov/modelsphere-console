import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@/modules/billing/money";

describe("wallet money at the form boundary", () => {
  it("preserves fractional nanounits and amounts beyond JavaScript integer precision", () => {
    expect(parseMoney("2.000000001")).toBe("2000000001");
    expect(parseMoney("9007199.254740993")).toBe("9007199254740993");
    expect(formatMoney("-1850000", "USD")).toBe("USD -0.00185");
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
});
