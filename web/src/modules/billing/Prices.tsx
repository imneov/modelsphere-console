import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  PageBanner,
  ResourceTable,
  Tabs,
  TabsList,
  TabsTrigger,
  type ResourceColumn,
} from "@modelsphere/ui";
import { Tags } from "lucide-react";
import { api, type Price, type PriceRule } from "@/modules/billing/api";
import { formatMoney } from "@/modules/billing/money";
import { useT } from "@/modules/billing/i18n";
import { PriceForm } from "@/modules/billing/PriceForm";

type PriceRow = PriceRule & { id: string };

export function Prices() {
  const t = useT();
  const [tab, setTab] = useState("current");
  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("priceTitle")} icon={<Tags className="size-5" />} />
      <div className="min-h-0 flex-1 space-y-4 p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="current">{t("current")}</TabsTrigger>
            <TabsTrigger value="history">{t("history")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "history" ? <PriceHistory /> : <CurrentPrices />}
      </div>
    </div>
  );
}

function CurrentPrices() {
  const t = useT();
  const rules = useQuery({
    queryKey: ["billing", "prices"],
    queryFn: api.prices,
    refetchInterval: 5000,
  });
  const columns = usePriceColumns();
  const rows = (rules.data?.items ?? []).map((rule) => ({
    ...rule,
    id: rule.metadata.name,
  }));
  return (
    <ResourceTable<PriceRow>
      data={rows}
      rowKey="id"
      columns={columns}
      loading={rules.isLoading}
      error={rules.error}
      onRetry={() => void rules.refetch()}
      emptyTitle={t("empty")}
      toolbarLeft={<PublishPrice />}
    />
  );
}

function usePriceColumns() {
  const t = useT();
  const columns: ResourceColumn<PriceRow>[] = [
    { key: "model", title: t("model"), render: (rule) => rule.spec.model },
    {
      key: "version",
      title: t("version"),
      render: (rule) => rule.spec.priceVersion,
    },
    { key: "unit", title: t("unit"), render: (rule) => rule.spec.unitTokens },
    ...(["inputRate", "cacheRate", "outputRate"] as const).map((rate) => ({
      key: rate,
      title: t(rate),
      render: (rule: PriceRule) =>
        formatMoney(rule.spec[rate], rule.spec.currency),
    })),
    {
      key: "observed",
      title: t("observed"),
      render: (rule) =>
        rule.status?.error || rule.status?.observedVersion || t("waiting"),
    },
  ];
  return columns;
}

function PublishPrice() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wallet = useQuery({
    queryKey: ["billing", "wallet", ""],
    queryFn: () => api.wallet(""),
  });
  return (
    <>
      <Button disabled={!wallet.data} onClick={() => setOpen(true)}>
        {t("publish")}
      </Button>
      {wallet.error && (
        <p role="alert" className="text-sm text-destructive">
          {wallet.error.message}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {open && wallet.data && <PriceForm currency={wallet.data.currency} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PriceHistory() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const history = useQuery({
    queryKey: ["billing", "priceHistory", page, limit],
    queryFn: () => api.priceHistory("", page, limit),
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
