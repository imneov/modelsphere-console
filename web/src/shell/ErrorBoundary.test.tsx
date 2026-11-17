import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "@/shell/ErrorBoundary";

describe("ErrorBoundary", () => {
  it("keeps the thrown error so the fallback can show it", () => {
    const error = new Error("boom");
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it("wraps non-Error throws into an Error", () => {
    const state = ErrorBoundary.getDerivedStateFromError("boom");
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe("boom");
  });
});
