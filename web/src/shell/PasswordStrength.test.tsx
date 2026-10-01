import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SamePasswordHint } from "@/shell/PasswordStrength";

describe("SamePasswordHint", () => {
  it("warns when the new password equals the current one", () => {
    expect(renderToStaticMarkup(<SamePasswordHint current="P@88w0rd" next="P@88w0rd" />)).toContain("新密码与当前密码相同");
  });

  it("stays quiet otherwise", () => {
    expect(renderToStaticMarkup(<SamePasswordHint current="P@88w0rd" next="Other-Pass1" />)).toBe("");
    expect(renderToStaticMarkup(<SamePasswordHint current="" next="" />)).toBe("");
  });
});
