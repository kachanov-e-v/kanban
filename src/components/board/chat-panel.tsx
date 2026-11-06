"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getChatHistory, sendChatMessage, clearChatHistory } from "@/lib/actions/chat";
import type { ChatMessageDTO } from "@/lib/actions/chat";

export function ChatPanel({ boardId }: { boardId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const h = await getChatHistory(boardId);
        if (!cancelled) setMessages(h);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки чата");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, boardId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const tempId = -Date.now();
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: text, createdAt: new Date().toISOString() }]);
    setLoading(true);
    try {
      const res = await sendChatMessage(boardId, text);
      setMessages((prev) => [...prev, { id: Date.now(), role: "assistant", content: res.reply, createdAt: new Date().toISOString() }]);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка отправки");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    startTransition(async () => {
      try {
        await clearChatHistory(boardId);
        setMessages([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary border-[3px] border-outline shadow-level3 hover:-translate-y-0.5"
        aria-label="Открыть чат"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[70vh] w-[380px] max-w-[95vw] flex-col rounded-radius-lg bg-surface border-[3px] border-outline shadow-level4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b-[3px] border-outline bg-surface">
            <h2 className="type-title-medium text-on-surface">Чат доски</h2>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="text" onClick={handleClear} disabled={isPending}>
                Очистить
              </Button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-on-surface hover:bg-on-surface/8"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {messages.length === 0 && !loading && (
              <p className="type-body-medium text-on-surface/60 text-center mt-8">
                Спросите про погоду или попросите создать карточки.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-radius-md px-3 py-2 border-[2px] border-outline ${
                  m.role === "user"
                    ? "self-end bg-primary-container text-on-primary-container"
                    : "self-start bg-surface-variant text-on-surface"
                }`}
              >
                <p className="type-body-medium whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
            {loading && (
              <div className="self-start flex items-center gap-2 text-on-surface/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="type-body-medium">Думаю...</span>
              </div>
            )}
            {error && (
              <p className="type-body-medium text-error self-center">{error}</p>
            )}
          </div>

          <div className="border-t-[3px] border-outline px-3 py-2 flex items-center gap-2 bg-surface">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Сообщение..."
              className="flex-1 h-10 px-3 rounded-radius-sm bg-surface border-[2px] border-outline text-on-surface placeholder:text-on-surface/50 focus:outline-none focus:border-primary"
              disabled={loading}
            />
            <Button size="sm" onClick={handleSend} loading={loading} disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}