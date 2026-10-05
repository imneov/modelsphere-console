import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@modelsphere/ui";
import { api } from "@/modules/playground/api";
import { useT } from "@/modules/playground/i18n";

export function useModels() {
  return useQuery({ queryKey: ["playground", "models"], queryFn: api.models, retry: false });
}

export function ModelSelect({ id, value, onChange, className }: { id?: string; value: string; onChange: (model: string) => void; className?: string }) {
  const t = useT();
  const models = useModels();
  return (
    // null, not "", is what makes Base UI show the placeholder.
    <Select<string> value={value || null} onValueChange={(v) => v && onChange(v)} disabled={!models.data?.length}>
      <SelectTrigger id={id} className={`w-full ${className ?? ""}`}>
        <SelectValue placeholder={models.isLoading ? t("common:status.loading") : models.data?.length ? t("modelSelect.placeholder") : t("modelSelect.none")} />
      </SelectTrigger>
      <SelectContent>
        {(models.data ?? []).map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// NoModels says why the list is empty: the gateway answered, but no route on it
// has a model ready to serve yet. A failed request is modelsHint's to explain.
export function NoModels({ className }: { className?: string }) {
  const t = useT();
  const models = useModels();
  if (!models.isSuccess || models.data.length > 0) return null;
  return (
    <p className={`text-xs text-muted-foreground ${className ?? ""}`}>
      {t("modelSelect.noneHint")}{" "}
      <Link to="/swiss" className="text-primary underline-offset-4 hover:underline">
        {t("modelSelect.deploy")}
      </Link>
    </p>
  );
}
