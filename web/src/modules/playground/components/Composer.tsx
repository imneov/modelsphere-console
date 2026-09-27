import { useState } from "react";
import { Button, Textarea, ToggleGroup, ToggleGroupItem } from "@riseaicloud/ui";
import { Plus, Send, Square } from "lucide-react";
import type { Role } from "@/modules/playground/useChat";

interface Props {
  disabled: boolean;
  streaming: boolean;
  // The conversation already ends in a user turn, so Send may go with no text.
  pendingUser: boolean;
  onSend: (text: string, role: Role) => void;
  onAdd: (role: Role, text: string) => void;
  onStop: () => void;
  status?: string;
}

// Both buttons append the text as the chosen role; Send then asks the model, Add
// does not -- which is how a few-shot conversation is built by hand.
export function Composer({ disabled, streaming, pendingUser, onSend, onAdd, onStop, status }: Props) {
  const [input, setInput] = useState("");
  const [role, setRole] = useState<Role>("user");

  const canSend = !disabled && !streaming && (!!input.trim() || pendingUser);
  const send = () => {
    if (!canSend) return;
    onSend(input, role);
    setInput("");
  };
  const add = () => {
    if (!input.trim() || streaming) return;
    onAdd(role, input);
    setInput("");
  };

  return (
    <div className="space-y-2 border-t border-border p-4">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={3}
        placeholder={role === "user" ? "Enter 发送，Shift+Enter 换行" : "以助手身份写一条消息：「添加」只追加，「发送」追加后请模型续写"}
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <ToggleGroup type="single" size="sm" variant="outline" value={role} onValueChange={(v) => v && setRole(v as Role)}>
            <ToggleGroupItem value="user">用户</ToggleGroupItem>
            <ToggleGroupItem value="assistant">助手</ToggleGroupItem>
          </ToggleGroup>
          <span className="text-xs text-muted-foreground">{status}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={add} disabled={disabled || streaming || !input.trim()} title="追加到对话，不请求模型">
            <Plus className="mr-1 h-4 w-4" />
            添加
          </Button>
          {streaming ? (
            <Button variant="outline" onClick={onStop}>
              <Square className="mr-1 h-4 w-4" />
              停止
            </Button>
          ) : (
            <Button onClick={send} disabled={!canSend}>
              <Send className="mr-1 h-4 w-4" />
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
