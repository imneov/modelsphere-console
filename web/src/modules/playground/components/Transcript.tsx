import { useEffect, useRef, type ReactNode } from "react";
import { Message } from "@/modules/playground/components/Message";
import type { Chat } from "@/modules/playground/useChat";

export function Transcript({ chat, empty, className }: { chat: Chat; empty: ReactNode; className?: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastTopRef = useRef(0);

  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastTopRef.current = el.scrollTop;
  }, [chat.turns]);

  const last = chat.turns.length - 1;
  return (
    <div
      ref={scrollerRef}
      // Only moving up unsticks: the scroll event of our own jump to the bottom
      // arrives after more content has landed, and must not read as the user
      // scrolling away.
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollTop < lastTopRef.current - 2) stickRef.current = false;
        else if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) stickRef.current = true;
        lastTopRef.current = el.scrollTop;
      }}
      className={`space-y-4 overflow-y-auto p-4 ${className ?? ""}`}
    >
      {chat.turns.length === 0
        ? empty
        : chat.turns.map((turn, i) => (
            <Message
              key={turn.id}
              turn={turn}
              locked={chat.streaming}
              onEdit={chat.edit}
              onRemove={chat.remove}
              onRegenerate={i === last && turn.role === "assistant" ? chat.regenerate : undefined}
            />
          ))}
    </div>
  );
}
