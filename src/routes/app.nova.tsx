import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { subDays } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, RotateCcw, User } from "lucide-react";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useSales, useProducts, useCustomers, useExpenses } from "@/lib/data/hooks";
import { answerNova, NOVA_SUGGESTIONS, type NovaContext } from "@/lib/nova/engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/nova")({
  component: NovaPage,
});

type Message = { id: string; role: "user" | "assistant"; text: string };

function NovaPage() {
  const { currentOrganization } = useOrganization();
  const { data: sales = [] } = useSales({ from: subDays(new Date(), 35).toISOString() });
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: expenses = [] } = useExpenses();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const ctx: NovaContext = useMemo(() => ({
    shopName: currentOrganization?.name ?? "votre boutique",
    currency: currentOrganization?.currency,
    sales, products, customers, expenses,
  }), [currentOrganization, sales, products, customers, expenses]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: trimmed };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setThinking(true);
    window.setTimeout(() => {
      const reply = answerNova(trimmed, ctx);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: reply }]);
      setThinking(false);
    }, 500 + Math.random() * 400);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-card/50 px-5 py-4 sm:px-8">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold tracking-tight">Nova</h1>
          <p className="truncate text-xs text-muted-foreground">Assistant de {currentOrganization?.name ?? "votre boutique"}</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Nouvelle conversation
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && (
            <div>
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-foreground">
                Bonjour 👋 Je suis Nova, l'assistant IA de {currentOrganization?.name ?? "votre boutique"}. Posez-moi une question sur vos ventes, produits, stock, clients ou dépenses.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {NOVA_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex items-start gap-2.5", m.role === "user" && "flex-row-reverse")}
              >
                <div className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                  m.role === "user" ? "bg-primary/15 text-primary" : "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground",
                )}>
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div className={cn(
                  "max-w-lg whitespace-pre-line rounded-2xl px-4 py-3 text-sm",
                  m.role === "user"
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-muted text-foreground",
                )}>
                  {m.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {thinking && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="border-t border-border p-3 sm:px-8"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoGrow(e.target); }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Poser une question à Nova… (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)"
            className="min-w-0 flex-1 resize-none rounded-2xl bg-muted px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || thinking}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
            aria-label="Envoyer"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
