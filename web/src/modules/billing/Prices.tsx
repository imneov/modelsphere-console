import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  DataSelect,
  Dialog,
  DialogContent,
  Label,
  ResourceTable,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  type ResourceColumn,
} from "@modelsphere/ui";
import { Plus } from "lucide-react";
import { api, type Price, type PriceRule } from "./api";
import { formatMoney } from "./money";
import { useT } from "./i18n";
import { PriceForm } from "./PriceForm";
import { PriceHistory } from "./PriceHistory";
import { BillingPage, BillingRefresh } from "./BillingPage";

type PriceRow = PriceRule & { id: string };

/** How often the current-price tab waits for a published version to activate. */
const PRICE_POLL_MS = 5000;

export function Prices() {
  const t = useT();
  const [tab, setTab] = useState("current");
  const [historyModel, setHistoryModel] = useState("");
  const [selected, setSelected] = useState<Price | null | undefined>(undefined);
  const [createCurrency, setCreateCurrency] = useState("");
  const [model, setModel] = useState("");
  const [pending, setPending] = useState(false);
  const rules = useQuery({
    queryKey: ["billing", "prices"],
    queryFn: api.prices,
    refetchInterval: tab === "current" ? PRICE_POLL_MS : false,
  });
  const wallet = useQuery({
    queryKey: ["billing", "wallet", ""],
    queryFn: () => api.wallet(""),
    enabled: Boolean(rules.data && rules.data.items.length === 0),
  });
  const currency = rules.data?.items[0]?.spec.currency ?? wallet.data?.currency;
  // Captured when the dialog opens so a background refetch cannot empty it mid-edit.
  const formCurrency = selected?.currency ?? createCurrency;
  const columns = usePriceColumns(setSelected, setHistoryModel);
  const rows = (rules.data?.items ?? []).map((rule) => ({
    ...rule,
    id: rule.metadata.name,
  }));
  return (
    <BillingPage
      title={t("priceTitle")}
      description={t("priceDescription")}
      actions={<BillingRefresh />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="current">{t("current")}</TabsTrigger>
            <TabsTrigger value="history">{t("history")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          disabled={!currency}
          onClick={() => {
            setCreateCurrency(currency ?? "");
            setSelected(null);
          }}
        >
          <Plus className="size-4" />
          {t("publish")}
        </Button>
      </div>
      {wallet.error && !currency && (
        <p role="alert" className="text-sm text-destructive">
          {wallet.error.message}
        </p>
      )}
      {tab === "current" ? (
        <ResourceTable<PriceRow>
          data={rows}
          rowKey="id"
          columns={columns}
          loading={rules.isLoading}
          error={rules.error}
          onRetry={() => void rules.refetch()}
          emptyTitle={t("emptyPrices")}
          emptyDescription={t("emptyPricesHint")}
        />
      ) : (
        <>
          <div className="w-full space-y-1.5 sm:w-72">
            <Label htmlFor="billing-price-model">{t("model")}</Label>
            <DataSelect
              id="billing-price-model"
              searchable
              value={model || "all"}
              onValueChange={(value) => setModel(value === "all" ? "" : value)}
              options={[
                { value: "all", label: t("allModels") },
                ...rows.map((row) => ({
                  value: row.spec.model,
                  label: row.spec.model,
                })),
              ]}
            />
          </div>
          <PriceHistory key={model} model={model} />
        </>
      )}
      <Dialog
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open && !pending) setSelected(undefined);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {selected !== undefined && formCurrency && (
            <PriceForm
              currency={formCurrency}
              initial={selected ?? undefined}
              onClose={() => setSelected(undefined)}
              onPendingChange={setPending}
            />
          )}
        </DialogContent>
      </Dialog>
      <Sheet
        dismissible
        open={Boolean(historyModel)}
        onOpenChange={(open) => {
          if (!open) setHistoryModel("");
        }}
      >
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle>{t("history")}</SheetTitle>
            <SheetDescription>{historyModel}</SheetDescription>
          </SheetHeader>
          <SheetBody className="pb-6">
            {historyModel && (
              <PriceHistory key={historyModel} model={historyModel} />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </BillingPage>
  );
}

function usePriceColumns(
  onPublish: (price: Price) => void,
  onHistory: (model: string) => void,
): ResourceColumn<PriceRow>[] {
  const t = useT();
  return [
    {
      key: "model",
      title: t("model"),
      render: (rule) => (
        <div className="space-y-1">
          <p className="font-medium">{rule.spec.model}</p>
          <p className="text-xs text-muted-foreground">
            {t("version")}: {rule.spec.priceVersion}
          </p>
        </div>
      ),
    },
    ...(["inputRate", "cacheRate", "outputRate"] as const).map((rate) => ({
      key: rate,
      title: t(rate),
      render: (rule: PriceRule) => (
        <div className="space-y-1">
          <p className="tabular-nums">
            {formatMoney(rule.spec[rate], rule.spec.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            / {rule.spec.unitTokens.toLocaleString()} Token
          </p>
        </div>
      ),
    })),
    {
      key: "observed",
      title: t("observed"),
      render: (rule) =>
        rule.status?.error ? (
          <span className="text-destructive">{rule.status.error}</span>
        ) : (
          <Badge
            variant={
              rule.status?.observedVersion === rule.spec.priceVersion
                ? "secondary"
                : "outline"
            }
          >
            {t(
              rule.status?.observedVersion === rule.spec.priceVersion
                ? "effective"
                : "waiting",
            )}
          </Badge>
        ),
    },
    {
      key: "actions",
      title: t("actions"),
      render: (rule) => (
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onPublish(rule.spec)}
          >
            {t("publishVersion")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onHistory(rule.spec.model)}
          >
            {t("history")}
          </Button>
        </div>
      ),
    },
  ];
}
