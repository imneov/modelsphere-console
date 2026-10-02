import { useQuery } from "@tanstack/react-query";
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
