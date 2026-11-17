import { describe, expect, it } from "vitest";
import { priceInput } from "@/modules/billing/PriceForm";
import { creditInput } from "@/modules/billing/CreditDialog";
import type { Owner, Wallet } from "@/modules/billing/api";

const draft = {
  model: " qwen ",
  version: " v2 ",
  unit: "1000000",
  inputRate: "1.00",
  cacheRate: "0.25",
  outputRate: "2",
};

describe("price publication input", () => {
  it("trims text fields and converts decimal rates to nanounits", () => {
    expect(priceInput(draft, "USD")).toMatchObject({
      model: "qwen",
      priceVersion: "v2",
      currency: "USD",
      unitTokens: 1000000,
      inputRate: "1000000000",
      cacheRate: "250000000",
      outputRate: "2000000000",
    });
  });

  it("rejects a missing currency, model, version or unit", () => {
    expect(() => priceInput({ ...draft, model: " " }, "USD")).toThrow();
    expect(() => priceInput({ ...draft, version: "" }, "USD")).toThrow();
    expect(() => priceInput(draft, "")).toThrow();
    for (const unit of ["0", "-1", "1.5", "1e6"]) {
      expect(() => priceInput({ ...draft, unit }, "USD")).toThrow();
    }
  });

  it("rejects negative rates", () => {
    expect(() =>
      priceInput({ ...draft, outputRate: "-0.01" }, "USD"),
    ).toThrow();
  });
});

const owner: Owner = { name: "alice", uid: "uid-1" };
const wallet: Wallet = {
  ownerUserID: "uid-1",
  currency: "USD",
  balance: "1000000000",
  ledgerBalance: "1000000000",
  revision: 1,
  billingState: "allowed",
};
const movement = {
  owner,
  wallet,
  operationID: "op-1",
  amount: "0.01",
  kind: "topup" as const,
};

describe("wallet credit input", () => {
  it("converts the amount to nanounits and carries the target account", () => {
    expect(creditInput(movement)).toEqual({
      operationID: "op-1",
      user: "alice",
      principalUID: "uid-1",
      currency: "USD",
      amount: "10000000",
      kind: "topup",
    });
  });

  it("rejects zero and negative top-ups but allows negative adjustments", () => {
    expect(() => creditInput({ ...movement, amount: "0" })).toThrow();
    expect(() => creditInput({ ...movement, amount: "-1" })).toThrow();
    expect(
      creditInput({ ...movement, amount: "-1", kind: "adjustment" }).amount,
    ).toBe("-1000000000");
  });
});
