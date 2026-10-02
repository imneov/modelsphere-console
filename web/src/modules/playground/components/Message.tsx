import { useState } from "react";
import { Button, Textarea } from "@riseaicloud/ui";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { CopyButton } from "@/shell";
import { Markdown } from "@/modules/playground/components/Markdown";
import { useT } from "@/modules/playground/i18n";
import { statsParts } from "@/modules/playground/stats";
import { splitThink } from "@/modules/playground/think";
import type { Turn } from "@/modules/playground/useChat";

interface Props {
  turn: Turn;
  // Editing and deleting are off while a stream runs: the history it was sent
  // with must stay what the transcript shows.
  locked: boolean;
  onEdit: (id: string, content: string) => void;
  onRemove: (id: string) => void;
  onRegenerate?: () => void;
}

export function Message({ turn, locked, onEdit, onRemove, onRegenerate }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    return (
      <div className={turn.role === "user" ? "ml-auto w-[85%] space-y-2" : "w-full space-y-2"}>
        <Textarea
          autoFocus
          rows={Math.min(12, Math.max(3, draft.split("\n").length))}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDraft(null);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onEdit(turn.id, draft);
              setDraft(null);
            }}
          >
            {t("common:actions.save")}
          </Button>
        </div>
      </div>
    );
  }

  const actions = (
    <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
      {turn.content ? <CopyButton text={turn.content} /> : null}
      <Button variant="ghost" size="sm" className="h-7 px-2" disabled={locked} onClick={() => setDraft(turn.content)} title={t("message.edit")}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 px-2" disabled={locked} onClick={() => onRemove(turn.id)} title={t("message.delete")}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      {onRegenerate ? (
        <Button variant="ghost" size="sm" className="h-7 px-2" disabled={locked} onClick={onRegenerate} title={t("message.regenerate")}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );

  if (turn.role === "user") {
    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{turn.content}</div>
        {actions}
      </div>
    );
  }

  const thought = splitThink(turn.content);
  const reasoning = [turn.reasoning, thought.reasoning].filter(Boolean).join("\n\n");
  const thinking = !!turn.pending && (thought.thinking || (!!turn.reasoning && !thought.answer));
  const empty = !thought.answer && !reasoning;

  return (
    <div className="group w-full space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{t("message.assistant")}</div>

      {reasoning ? (
        <details className="rounded-md border border-border bg-muted/40 px-3 py-2" open={thinking}>
          <summary className="cursor-pointer text-xs text-muted-foreground">{thinking ? t("message.thinking") : t("message.reasoning")}</summary>
          <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{reasoning}</div>
        </details>
      ) : null}

      {thought.answer ? <Markdown text={thought.answer} /> : null}
      {empty && turn.pending ? <div className="text-sm text-muted-foreground">…</div> : null}
      {turn.error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{turn.error}</div> : null}

      {!turn.pending ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {turn.stats ? (
            <span className="text-xs text-muted-foreground">
              {statsParts(turn.stats, t).join(" · ")}
              {turn.stopped ? ` · ${t("message.stopped")}` : ""}
            </span>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
