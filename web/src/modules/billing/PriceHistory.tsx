import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResourceTable, type ResourceColumn } from "@modelsphere/ui";
import { api, type Price } from "./api";
import { formatMoney } from "./money";
import { useT } from "./i18n";

export function PriceHistory({ model }: { model: string }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const history = useQuery({
    queryKey: ["billing", "priceHistory", model, page, limit],
    queryFn: () => api.priceHistory(model, page, limit),
    placeholderData: (previous) => previous,
  });
  const columns: ResourceColumn<Price>[] = [
    { key: "model", title: t("model") },
    { key: "priceVersion", title: t("version") },
    { key: "unitTokens", title: t("unit") },
    ...(["inputRate", "cacheRate", "outputRate"] as const).map((rate) => ({
      key: rate,
      title: t(rate),
      render: (price: Price) => formatMoney(price[rate], price.currency),
    })),
  ];
  const rows = (history.data?.items ?? []).map((price) => ({
    ...price,
    id: `${price.ruleID}/${price.priceVersion}`,
  }));
  return (
    <ResourceTable
      mode="remote"
      data={rows}
      rowKey="id"
      columns={columns}
      total={history.data?.totalItems ?? 0}
      page={history.data?.page ?? page}
      pageSize={history.data?.limit ?? limit}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setLimit(size);
        setPage(1);
      }}
      loading={history.isLoading}
      error={history.error}
      onRetry={() => void history.refetch()}
      emptyTitle={t("empty")}
    />
  );
}
