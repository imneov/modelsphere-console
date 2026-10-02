import { useCallback, useState } from "react";
import { Button } from "@riseaicloud/ui";
import { Check, Copy } from "lucide-react";
import { useT } from "@/shell/i18n";

// copyText falls back to execCommand: the console is commonly served over plain
// http on a node port, where navigator.clipboard does not exist.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}

export function CopyButton({ text, label, className }: { text: string | (() => string); label?: string; className?: string }) {
  const t = useT("common");
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void copyText(typeof text === "function" ? text() : text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  const Icon = copied ? Check : Copy;
  return (
    <Button type="button" variant="ghost" size="sm" className={`h-7 px-2 ${className ?? ""}`} onClick={copy} title={t(copied ? "actions.copied" : "actions.copy")}>
      <Icon className={label ? "mr-1 h-3.5 w-3.5" : "h-3.5 w-3.5"} />
      {label}
    </Button>
  );
}
