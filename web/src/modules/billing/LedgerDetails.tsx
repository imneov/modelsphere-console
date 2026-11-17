import { CopyButton } from "@modelsphere/ui";
import { formatDateTime } from "@/shell";
import type { LedgerEntry } from "./api";
import { formatMoney, isPositiveMoney } from "./money";
import { useT } from "./i18n";

export function LedgerDetails({ entry }: { entry: LedgerEntry }) {
  const t = useT();
  const facts = [
    ["at", formatDateTime(entry.occurredAt)],
    ["actor", entry.actor],
    ["operation", entry.operationID],
    ["chargeID", entry.chargeID || "—"],
    ["ledgerRevision", entry.revision],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-lg border bg-surface-section p-5">
        <p className="text-sm text-muted-foreground">
          {t(entry.kind === "charge" ? "debit" : entry.kind, {
            defaultValue: entry.kind,
          })}
        </p>
        <p className="break-all text-2xl font-semibold tabular-nums">
          {isPositiveMoney(entry.amount) ? "+ " : ""}
          {formatMoney(entry.amount, entry.currency)}
        </p>
      </div>
      <dl className="divide-y">
        {facts.map(([label, value]) => (
          <div key={label} className="space-y-2 py-3">
            <dt className="text-xs text-muted-foreground">{t(label)}</dt>
            <dd className="flex items-start gap-2 break-all text-sm">
              <span>{value}</span>
              {typeof value === "string" && label !== "at" && value !== "—" && (
                <CopyButton
                  text={value}
                  aria-label={t("copyField", { field: t(label) })}
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
