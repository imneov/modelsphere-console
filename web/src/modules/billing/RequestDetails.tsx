import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modelsphere/ui";
import { usePermissions, type TFn } from "@/shell";
import { api, type BillingRequest } from "@/modules/billing/api";
import { formatMoney } from "@/modules/billing/money";
import { useT } from "@/modules/billing/i18n";

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
  const facts = requestFacts(request, t);
  return (
    <div className="space-y-4 p-3">
      <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{t(label)}</dt>
            <dd className="break-all font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
      {request.attempts?.length ? (
        <ol className="space-y-1 text-xs">
          {request.attempts.map((attempt) => (
            <li key={attempt.id}>
              <code>{attempt.id}</code> ·{" "}
              {t(`reasons.${attempt.reason}`, { defaultValue: attempt.reason })}
            </li>
          ))}
        </ol>
      ) : null}
      {request.pricingError && (
        <p>
          {t("pricingError")}: {request.pricingError}
        </p>
      )}
      <div className="flex gap-2">
        {request.charge && (
          <Button variant="outline" onClick={() => onLedger(request.requestID)}>
            {t("ledgerLink")}
          </Button>
        )}
      </div>
      <RequestRecovery request={request} ownerUID={ownerUID} />
    </div>
  );
}

function requestFacts(
  request: BillingRequest,
  t: TFn,
): [string, string | number][] {
  const facts: [string, string | number][] = [
    ["request", request.requestID],
    ["attempt", request.attemptID],
    ["source", t(request.identitySource)],
    ["key", request.apiKeyID || t("noKey")],
    ["upstreamID", request.upstreamRequestID || "—"],
    ["input", request.usage.inputTokens],
    ["cached", request.usage.cacheTokens],
    ["output", request.usage.outputTokens],
    ["usageSource", request.usage.source || t("incomplete")],
  ];
  if (request.charge)
    facts.push(
      ["chargeRevision", request.charge.chargeRevision],
      ["version", request.charge.price.priceVersion],
      ["unit", request.charge.price.unitTokens],
      [
        "inputRate",
        formatMoney(request.charge.price.inputRate, request.charge.currency),
      ],
      [
        "cacheRate",
        formatMoney(request.charge.price.cacheRate, request.charge.currency),
      ],
      [
        "outputRate",
        formatMoney(request.charge.price.outputRate, request.charge.currency),
      ],
    );
  return facts;
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
