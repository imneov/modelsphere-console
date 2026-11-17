import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Customers } from "./Customers";
import { api } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("customer overview refresh", () => {
  it("advances the time window on refresh, including across local midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const mounted = new Date(2026, 10, 18, 10);
    vi.setSystemTime(mounted);
    const customers = vi.spyOn(api, "adminCustomers").mockResolvedValue({ items: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <MemoryRouter><Customers /></MemoryRouter>
        </QueryClientProvider>,
      );
      const query = client.getQueryCache().find({ queryKey: ["billing", "admin-customers"], exact: false })!;
      const refresh = () => client.fetchQuery({ ...query.options, queryKey: query.queryKey });
      await refresh();
      expect(customers).toHaveBeenLastCalledWith(
        new Date(2026, 10, 18).toISOString(), mounted.toISOString(),
      );
      const later = new Date(2026, 10, 18, 11);
      vi.setSystemTime(later);
      await refresh();
      expect(customers).toHaveBeenLastCalledWith(
        new Date(2026, 10, 18).toISOString(), later.toISOString(),
      );
      const nextDay = new Date(2026, 10, 19, 1);
      vi.setSystemTime(nextDay);
      await refresh();
      expect(customers).toHaveBeenLastCalledWith(
        new Date(2026, 10, 19).toISOString(), nextDay.toISOString(),
      );
    } finally {
      client.clear();
    }
  });
});
