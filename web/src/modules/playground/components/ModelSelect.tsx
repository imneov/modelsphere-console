import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@riseaicloud/ui";
import { api } from "@/modules/playground/api";

export function useModels() {
  return useQuery({ queryKey: ["playground", "models"], queryFn: api.models, retry: false });
}

export function ModelSelect({ id, value, onChange, className }: { id?: string; value: string; onChange: (model: string) => void; className?: string }) {
  const models = useModels();
  return (
    <Select value={value} onValueChange={onChange} disabled={!models.data?.length}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={models.isLoading ? "加载中…" : models.data?.length ? "选择模型" : "无可用模型"} />
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
