import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Button, Card, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, PageBanner } from "@modelsphere/ui";
import { Columns2, Eraser, Plus, SlidersHorizontal, X } from "lucide-react";
import { buildPayload } from "@/modules/playground/api";
import { Composer } from "@/modules/playground/components/Composer";
import { ModelSelect, NoModels, useModels } from "@/modules/playground/components/ModelSelect";
import { ParamsPanel } from "@/modules/playground/components/ParamsPanel";
import { Transcript } from "@/modules/playground/components/Transcript";
import { ViewCode } from "@/modules/playground/components/ViewCode";
import { useT } from "@/modules/playground/i18n";
import { DEFAULT_FORM, toChatParams, type ParamsForm } from "@/modules/playground/params";
import { historyOf, modelsHint, newId, useChat, type Role } from "@/modules/playground/useChat";

const MIN_PANELS = 2;
const MAX_PANELS = 4;

interface PanelHandle {
  send: (text: string, role: Role) => void;
  add: (role: Role, text: string) => void;
  stop: () => void;
  clear: () => void;
}

interface PanelState {
  streaming: boolean;
  lastRole?: Role;
}

interface Slot {
  id: string;
  model: string;
}

const GRID: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-2",
};

export function Compare() {
  const t = useT();
  const models = useModels();
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: MIN_PANELS }, () => ({ id: newId(), model: "" })));
  const [form, setForm] = useState<ParamsForm>(DEFAULT_FORM);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [states, setStates] = useState<Record<string, PanelState>>({});
  const handles = useRef(new Map<string, PanelHandle>());

  // Fill empty columns with models not yet shown, so the page compares something
  // on first load.
  useEffect(() => {
    const ids = (models.data ?? []).map((m) => m.id);
    if (!ids.length) return;
    setSlots((prev) => {
      if (prev.every((s) => s.model)) return prev;
      const used = new Set(prev.map((s) => s.model).filter(Boolean));
      return prev.map((s) => {
        if (s.model) return s;
        const next = ids.find((id) => !used.has(id)) ?? ids[0];
        used.add(next);
        return { ...s, model: next };
      });
    });
  }, [models.data]);

  const each = (fn: (h: PanelHandle) => void) => handles.current.forEach(fn);
  const onState = useCallback((id: string, state: PanelState) => setStates((prev) => ({ ...prev, [id]: state })), []);

  const active = slots.filter((s) => s.model);
  const streaming = slots.some((s) => states[s.id]?.streaming);
  const pendingUser = active.length > 0 && active.every((s) => states[s.id]?.lastRole === "user");

  return (
    <div>
      <PageBanner
        title={t("compare.title")}
        icon={<Columns2 className="size-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setParamsOpen(true)}>
              <SlidersHorizontal data-icon="inline-start" />
              {t("compare.params")}
            </Button>
            <Button
              variant="outline"
              disabled={slots.length >= MAX_PANELS}
              onClick={() =>
                setSlots((prev) => [
                  ...prev,
                  { id: newId(), model: models.data?.find((m) => !prev.some((s) => s.model === m.id))?.id ?? models.data?.[0]?.id ?? "" },
                ])
              }
            >
              <Plus data-icon="inline-start" />
              {t("compare.addModel")}
            </Button>
            <Button variant="outline" onClick={() => each((h) => h.clear())} disabled={streaming}>
              <Eraser data-icon="inline-start" />
              {t("compare.clearAll")}
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-4">
        {models.error ? <p className="text-sm text-destructive">{modelsHint(t, models.error)}</p> : <NoModels className="text-sm" />}

        <div className={`grid gap-4 ${GRID[slots.length] ?? "lg:grid-cols-2"}`}>
          {slots.map((slot, i) => (
            <ComparePanel
              key={slot.id}
              slot={slot}
              index={i}
              form={form}
              height={slots.length === 4 ? "h-[calc((100vh-26rem)/2)] min-h-[220px]" : "h-[calc(100vh-24rem)] min-h-[360px]"}
              onModel={(model) => setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, model } : s)))}
              onRemove={
                slots.length > MIN_PANELS
                  ? () => {
                      handles.current.get(slot.id)?.stop();
                      setSlots((prev) => prev.filter((s) => s.id !== slot.id));
                    }
                  : undefined
              }
              onState={onState}
              ref={(h: PanelHandle | null) => {
                if (h) handles.current.set(slot.id, h);
                else handles.current.delete(slot.id);
              }}
            />
          ))}
        </div>

        <Card className="gap-0 py-0">
          <Composer
            disabled={!active.length}
            streaming={streaming}
            pendingUser={pendingUser}
            onSend={(text, role) => each((h) => h.send(text, role))}
            onAdd={(role, text) => each((h) => h.add(role, text))}
            onStop={() => each((h) => h.stop())}
            status={streaming ? t("chat.generating") : t("compare.fanOut", { n: active.length })}
          />
        </Card>

        <Dialog open={paramsOpen} onOpenChange={setParamsOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("compare.params")}</DialogTitle>
              <DialogDescription>{t("compare.paramsHint")}</DialogDescription>
            </DialogHeader>
            <ParamsPanel form={form} onChange={setForm} idPrefix="cmp" />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

interface PanelProps {
  slot: Slot;
  index: number;
  form: ParamsForm;
  height: string;
  onModel: (model: string) => void;
  onRemove?: () => void;
  onState: (id: string, state: PanelState) => void;
  ref: Ref<PanelHandle>;
}

function ComparePanel({ slot, index, form, height, onModel, onRemove, onState, ref }: PanelProps) {
  const t = useT();
  const params = useMemo(() => toChatParams(slot.model, form), [slot.model, form]);
  const chat = useChat(params);

  useImperativeHandle(
    ref,
    () => ({
      send: (text, role) => {
        if (slot.model) chat.send(text, role);
      },
      add: (role, text) => chat.add(role, text),
      stop: chat.stop,
      clear: chat.clear,
    }),
    [chat, slot.model],
  );

  const lastRole = chat.turns.at(-1)?.role;
  useEffect(() => onState(slot.id, { streaming: chat.streaming, lastRole }), [onState, slot.id, chat.streaming, lastRole]);

  return (
    <Card className={`flex flex-col gap-0 py-0 ${height}`}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">{index + 1}</span>
        <ModelSelect
          value={slot.model}
          className="h-8 min-w-0 flex-1"
          onChange={(model) => {
            // A different model is a different conversation; history from the
            // old one would not be comparable.
            chat.clear();
            onModel(model);
          }}
        />
        <ViewCode compact payload={() => buildPayload(historyOf(chat.turns), params)} disabled={!slot.model} />
        <Button variant="ghost" size="icon-sm" title={t("compare.clear")} onClick={chat.clear} disabled={chat.streaming || !chat.turns.length}>
          <Eraser className="h-3.5 w-3.5" />
        </Button>
        {onRemove ? (
          <Button variant="ghost" size="icon-sm" title={t("compare.remove")} onClick={onRemove}>
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      <Transcript
        chat={chat}
        className="min-h-0 flex-1"
        empty={<p className="py-10 text-center text-sm text-muted-foreground">{slot.model ? t("compare.emptyReady") : t("compare.emptyPick")}</p>}
      />
    </Card>
  );
}
