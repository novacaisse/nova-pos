import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Send, Loader2, MessageSquare, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useShop } from "@/lib/auth/ShopProvider";
import {
  useSupportTickets, useSupportMessages, useCreateSupportTicket, useSendSupportMessage,
  type SupportTicket,
} from "@/lib/data/adminHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/support")({
  component: AppSupport,
});

const STATUS: Record<SupportTicket["status"], { label: string; color: string }> = {
  open: { label: "Ouvert", color: "bg-destructive/15 text-destructive" },
  in_progress: { label: "En cours", color: "bg-accent/25 text-accent-foreground" },
  resolved: { label: "Résolu", color: "bg-success/15 text-success" },
  closed: { label: "Fermé", color: "bg-muted text-muted-foreground" },
};

function AppSupport() {
  const { currentShop } = useShop();
  const { data: tickets = [], isLoading } = useSupportTickets("mine", currentShop?.id ?? null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader title="Support" subtitle="Une question, un problème ? Contactez l'équipe ZegCaisse."
        actions={
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau ticket
          </button>
        }
      />

      <div className="p-5 sm:p-8">
        {creating ? (
          <NewTicketForm shopId={currentShop?.id ?? null}
            onDone={(t) => { setCreating(false); if (t) setSelected(t); }} />
        ) : selected ? (
          <TicketThread ticket={selected} onBack={() => setSelected(null)} />
        ) : isLoading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-3 text-sm text-muted-foreground">Aucun ticket pour l'instant. Une question ? Ouvrez-en un.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => setSelected(t)}
                className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{t.subject}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS[t.status].color)}>{STATUS[t.status].label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewTicketForm({ shopId, onDone }: { shopId: string | null; onDone: (ticket: SupportTicket | null) => void }) {
  const create = useCreateSupportTicket();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!shopId || !subject.trim() || !message.trim()) return;
    setError(null);
    try {
      const ticket = await create.mutateAsync({ shopId, subject: subject.trim(), message: message.trim() });
      onDone(ticket);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer le ticket.");
    }
  };

  return (
    <div className="max-w-xl rounded-2xl border border-border bg-card p-6">
      <div className="font-display text-lg font-bold">Nouveau ticket</div>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sujet</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex : Problème d'impression de ticket"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
      </label>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Message</span>
        <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Décrivez votre problème ou votre question…"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
      </label>
      {error && <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
      <div className="mt-5 flex gap-2">
        <button onClick={() => onDone(null)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
        <button onClick={submit} disabled={create.isPending || !subject.trim() || !message.trim()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Envoyer
        </button>
      </div>
    </div>
  );
}

function TicketThread({ ticket, onBack }: { ticket: SupportTicket; onBack: () => void }) {
  const { data: messages = [], isLoading } = useSupportMessages(ticket.id);
  const send = useSendSupportMessage();
  const [reply, setReply] = useState("");

  const submitReply = async () => {
    if (!reply.trim()) return;
    await send.mutateAsync({ ticketId: ticket.id, body: reply.trim(), isAdmin: false });
    setReply("");
  };

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-bold">{ticket.subject}</div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS[ticket.status].color)}>{STATUS[ticket.status].label}</span>
      </div>

      <div className="max-h-[50vh] space-y-3 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aucun message.</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("max-w-[85%] rounded-2xl p-3 text-sm", m.is_admin ? "bg-muted" : "ml-auto bg-primary text-primary-foreground")}>
              <div>{m.body}</div>
              <div className={cn("mt-1 text-[10px]", m.is_admin ? "text-muted-foreground" : "text-primary-foreground/70")}>
                {m.is_admin ? "Équipe ZegCaisse" : "Vous"} · {new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <input value={reply} onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitReply(); }}
            placeholder="Répondre…" disabled={ticket.status === "closed"}
            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-50" />
          <button onClick={submitReply} disabled={send.isPending || !reply.trim() || ticket.status === "closed"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        {ticket.status === "closed" && (
          <div className="mt-2 text-[10px] text-muted-foreground">Ce ticket est fermé.</div>
        )}
      </div>
    </div>
  );
}
