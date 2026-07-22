import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Clock, CheckCircle2, X, Send, Loader2, Archive } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import {
  useSupportTickets, useSupportMessages, useSendSupportMessage, useUpdateTicketStatus,
  type SupportTicket,
} from "@/lib/data/adminHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/support")({
  component: AdminSupport,
});

const STATUS: Record<SupportTicket["status"], { label: string; color: string }> = {
  open: { label: "Ouvert", color: "bg-destructive/15 text-destructive" },
  in_progress: { label: "En cours", color: "bg-accent/25 text-accent-foreground" },
  resolved: { label: "Résolu", color: "bg-success/15 text-success" },
  closed: { label: "Fermé", color: "bg-muted text-muted-foreground" },
};

function AdminSupport() {
  const { data: tickets = [], isLoading } = useSupportTickets("all");
  const [selected, setSelected] = useState<SupportTicket | null>(null);

  const open = tickets.filter((t) => t.status === "open").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  return (
    <div>
      <PageHeader title="Support" subtitle="Tickets et demandes des boutiques" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Ouverts" value={String(open)} icon={<MessageSquare className="h-5 w-5" />} accent="destructive" />
          <StatCard label="En cours" value={String(inProgress)} icon={<Clock className="h-5 w-5" />} accent="accent" />
          <StatCard label="Résolus / fermés" value={String(resolved)} icon={<CheckCircle2 className="h-5 w-5" />} accent="success" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Boutique</th>
                <th className="px-4 py-3">Sujet</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Créé le</th>
                <th className="px-4 py-3">Mis à jour</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const s = STATUS[t.status];
                return (
                  <tr key={t.id} onClick={() => setSelected(t)} className="cursor-pointer border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 font-semibold">{t.shops?.name ?? "—"}</td>
                    <td className="px-4 py-3">{t.subject}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", s.color)}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(t.updated_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                );
              })}
              {tickets.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">Aucun ticket pour l'instant</td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && <TicketDrawer ticket={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

function TicketDrawer({ ticket, onClose }: { ticket: SupportTicket; onClose: () => void }) {
  const { data: messages = [], isLoading } = useSupportMessages(ticket.id);
  const send = useSendSupportMessage();
  const updateStatus = useUpdateTicketStatus();
  const [reply, setReply] = useState("");

  const submitReply = async () => {
    if (!reply.trim()) return;
    await send.mutateAsync({ ticketId: ticket.id, body: reply.trim(), isAdmin: true });
    setReply("");
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 24 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden border-l border-border bg-card shadow-elegant">
        <header className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="font-display text-lg font-bold">{ticket.subject}</div>
            <div className="mt-1 text-xs text-muted-foreground">{ticket.shops?.name ?? "—"}</div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-border hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>

        <div className="border-b border-border p-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Statut</div>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(STATUS) as SupportTicket["status"][]).map((s) => (
              <button key={s} onClick={() => updateStatus.mutate({ id: ticket.id, status: s })}
                disabled={updateStatus.isPending}
                className={cn("rounded-lg py-1.5 text-[10px] font-bold uppercase transition-colors disabled:opacity-50",
                  ticket.status === s ? STATUS[s].color : "border border-border/60 text-muted-foreground hover:bg-muted")}>
                {STATUS[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aucun message.</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("max-w-[85%] rounded-2xl p-3 text-sm", m.is_admin ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
                <div>{m.body}</div>
                <div className={cn("mt-1 text-[10px]", m.is_admin ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="border-t border-border p-4">
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
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Archive className="h-3 w-3" /> Ticket fermé — rouvrez-le pour répondre.</div>
          )}
        </footer>
      </motion.aside>
    </>
  );
}
