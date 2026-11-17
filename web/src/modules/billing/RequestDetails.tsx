import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, CopyButton } from "@modelsphere/ui";
import { usePermissions, type TFn } from "@/shell";
import { api, requestState, type BillingRequest } from "./api";
import { formatMoney } from "./money";
import { useT } from "./i18n";

export function RequestDetails({
  request,
  ownerUID,
  onLedger,
}: {
  request: BillingRequest;
  ownerUID: string;
  onLedger: (requestID: string) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border bg-surface-section p-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t(requestState(request))}</Badge>
          <Badge variant="outline">
            {t(request.usage.complete ? "complete" : "incomplete")}
          </Badge>
        </div>
        <p className="break-all text-3xl font-semibold tabular-nums">
          {request.charge
            ? formatMoney(request.charge.amount, request.charge.currency)
            : "—"}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("cost")}
          {request.reason
            ? ` · ${t(`reasons.${request.reason}`, { defaultValue: request.reason })}`
            : ""}
        </p>
      </div>
      <TokenDetails request={request} />
      {request.pricingError && (
        <p role="alert" className="text-sm text-destructive">
          {t("pricingError")}: {request.pricingError}
        </p>
      )}
      {request.charge && (
        <Button variant="outline" onClick={() => onLedger(request.requestID)}>
          {t("ledgerLink")}
        </Button>
      )}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {t("traceDetails")}
        </summary>
        <TraceDetails request={request} />
      </details>
      <RequestRecovery request={request} ownerUID={ownerUID} />
    </div>
  );
}

function TokenDetails({ request }: { request: BillingRequest }) {
  const t = useT();
  const price = request.charge?.price;
  const usage = request.charge?.usage ?? request.usage;
  const facts = [
    ["input", usage.inputTokens, price?.inputRate],
    ["cached", usage.cacheTokens, price?.cacheRate],
    ["output", usage.outputTokens, price?.outputRate],
  ] as const;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{t("usageBreakdown")}</h3>
      <div className="divide-y rounded-lg border">
        {facts.map(([label, count, rate]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
          >
            <div>
              <p>{t(label)}</p>
              {price && rate && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatMoney(rate, price.currency)} /{" "}
                  {price.unitTokens.toLocaleString()} Token
                </p>
              )}
            </div>
            <span className="font-medium tabular-nums">
              {usage.complete ? count.toLocaleString() : "—"}
            </span>
          </div>
        ))}
      </div>
      {price && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("frozenPriceHint", { version: price.priceVersion })}
        </p>
      )}
    </section>
  );
}

function TraceDetails({ request }: { request: BillingRequest }) {
  const t = useT();
  const facts = requestFacts(request, t);
  return (
    <div className="space-y-4 pt-4">
      <dl className="space-y-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{t(label)}</dt>
            <dd className="mt-1 flex items-start gap-2 break-all font-mono text-xs">
              <span>{value}</span>
              {typeof value === "string" && value !== "—" && (
                <CopyButton
                  text={value}
                  aria-label={t("copyField", { field: t(label) })}
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
      {Boolean(request.attempts?.length) && (
        <ol className="space-y-2 text-xs">
          {request.attempts?.map((attempt) => (
            <li key={attempt.id} className="break-all">
              <code>{attempt.id}</code> ·{" "}
              {t(`reasons.${attempt.reason}`, { defaultValue: attempt.reason })}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function requestFacts(
  request: BillingRequest,
  t: TFn,
): [string, string | number][] {
  return [
    ["request", request.requestID],
    ["attempt", request.attemptID],
    ["source", t(request.identitySource)],
    ["key", request.apiKeyID || t("noKey")],
    ["upstreamID", request.upstreamRequestID || "—"],
    ["usageSource", request.usage.source || t("incomplete")],
    ...(request.charge
      ? ([
          ["chargeID", request.charge.id],
          ["chargeRevision", request.charge.chargeRevision],
          ["version", request.charge.price.priceVersion],
        ] as [string, string | number][])
      : []),
  ];
}
function RequestRecovery({
  request,
  ownerUID,
}: {
  request: BillingRequest;
  ownerUID: string;
}) {
  const t = useT();
  const { has } = usePermissions();
  const client = useQueryClient();
  const verification = useMutation({
    mutationFn: () => api.supplement(request.requestID, ownerUID),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["billing", "usage"] }),
  });
  return (
    <>
      {" "}
      {has("billing.manage") && !request.usage.complete && (
        <Button
          variant="outline"
          disabled={verification.isPending}
          onClick={() => verification.mutate()}
        >
          {t("verifyUsage")}
        </Button>
      )}
      {verification.error && (
        <p role="alert" className="text-sm text-destructive">
          {verification.error.message}
        </p>
      )}
      {verification.isSuccess && (
        <p role="status" className="text-sm">
          {t("verified")}
        </p>
      )}
    </>
  );
}
