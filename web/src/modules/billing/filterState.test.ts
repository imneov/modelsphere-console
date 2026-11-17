import { describe, expect, it } from "vitest";
import {
  activeRange,
  ownerSwitchPatch,
  rangePatch,
  readFilters,
  sanitizeParams,
  updateFilters,
} from "@/modules/billing/filterState";

describe("billing filters kept in the URL", () => {
  it("defaults to the first page and an empty query", () => {
    const filters = readFilters(new URLSearchParams());
    expect(filters).toMatchObject({
      ownerUserID: "",
      model: "",
      apiKeyID: "",
      requestID: "",
      state: "",
      from: "",
      until: "",
      page: 1,
      limit: 20,
    });
  });

  it("treats malformed paging values as absent instead of NaN", () => {
    const filters = readFilters(
      new URLSearchParams({ page: "0", limit: "abc" }),
    );
    expect(filters.page).toBe(1);
    expect(filters.limit).toBe(20);
  });

  it("keeps a valid page and size from the URL", () => {
    const filters = readFilters(
      new URLSearchParams({ page: "3", limit: "50" }),
    );
    expect(filters.page).toBe(3);
    expect(filters.limit).toBe(50);
  });

  it("drops blank criteria and returns to the first page on a new query", () => {
    const current = new URLSearchParams({
      page: "4",
      model: "qwen",
      requestID: "abc",
    });
    const next = updateFilters(current, { model: "glm", requestID: "" });
    expect(next.get("model")).toBe("glm");
    expect(next.has("requestID")).toBe(false);
    expect(next.has("page")).toBe(false);
  });

  it("sets the page when the patch is a page change", () => {
    const next = updateFilters(new URLSearchParams({ page: "1" }), { page: 5 });
    expect(next.get("page")).toBe("5");
  });

  it("composes a page-size change with the reset to the first page", () => {
    const sized = updateFilters(new URLSearchParams({ page: "4" }), {
      limit: 50,
      page: 1,
    });
    const reset = updateFilters(sized, { page: 1 });
    expect(reset.get("limit")).toBe("50");
    expect(reset.get("page")).toBe("1");
  });

  it("drops timestamps that cannot be parsed", () => {
    const filters = readFilters(
      new URLSearchParams({ from: "notadate", until: "2026-11-17T00:00" }),
    );
    expect(filters.from).toBe("");
    expect(filters.until).toBe("2026-11-17T00:00");
  });

  it("clamps paging to the bounds the server accepts", () => {
    expect(readFilters(new URLSearchParams({ limit: "500" })).limit).toBe(20);
    expect(readFilters(new URLSearchParams({ page: "10000001" })).page).toBe(1);
  });

  it("clears the criteria owned by the previous account", () => {
    expect(ownerSwitchPatch("next-owner")).toEqual({
      ownerUserID: "next-owner",
      model: "",
      apiKeyID: "",
      requestID: "",
    });
  });

  it("rewrites a shared URL that carries values the UI rejects", () => {
    const next = sanitizeParams(
      new URLSearchParams({
        ownerUserID: "user-1",
        from: "notadate",
        limit: "500",
        page: "0",
        tab: "history",
      }),
    );
    expect(next.get("ownerUserID")).toBe("user-1");
    expect(next.has("from")).toBe(false);
    expect(next.has("limit")).toBe(false);
    expect(next.has("page")).toBe(false);
    // Unrelated parameters are not the filter layer's to drop.
    expect(next.get("tab")).toBe("history");
  });

  it("keeps accepted paging and timestamps while sanitizing", () => {
    const next = sanitizeParams(
      new URLSearchParams({
        page: "3",
        limit: "50",
        until: "2026-11-17T00:00",
      }),
    );
    expect(next.get("page")).toBe("3");
    expect(next.get("limit")).toBe("50");
    expect(next.get("until")).toBe("2026-11-17T00:00");
  });

  it("keeps a known settlement tab and drops an unknown one", () => {
    expect(readFilters(new URLSearchParams({ state: "pending" })).state).toBe(
      "pending",
    );
    expect(readFilters(new URLSearchParams({ state: "bogus" })).state).toBe("");
    const next = sanitizeParams(new URLSearchParams({ state: "bogus" }));
    expect(next.has("state")).toBe(false);
  });

  it("writes the selected tab without touching other criteria", () => {
    const next = updateFilters(new URLSearchParams({ model: "qwen", state: "settled" }), { state: "" });
    expect(next.get("model")).toBe("qwen");
    expect(next.has("state")).toBe(false);
  });

  it("derives a quick range ending now and recognises it again", () => {
    const now = new Date("2026-11-16T10:30:00");
    const patch = rangePatch("24h", now);
    expect(patch.from).toBe("2026-11-15T10:30");
    expect(patch.until).toBe("2026-11-16T10:30");
    expect(patch.page).toBe(1);
    const filters = readFilters(
      new URLSearchParams({ from: patch.from, until: patch.until }),
    );
    expect(activeRange(filters, now)).toBe("24h");
    expect(activeRange({ ...filters, until: "2026-11-16T09:00" }, now)).toBe("");
  });
});
