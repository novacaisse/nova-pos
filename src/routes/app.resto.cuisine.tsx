// Écran KDS (Kitchen Display System) ZegResto (Phase 2) — flux unique, pas
// de routage multi-poste (resto_menu_items.station existe pour ça mais
// n'est pas exploité en V1). Mis à jour en temps réel via Supabase Realtime
// (postgres_changes sur resto_kitchen_tickets/resto_order_items) — filet de
// sécurité refetchInterval si la connexion websocket tombe.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ChefHat, Flame, CheckCircle2, Clock3 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import {
  useRestoKitchenTickets, useUpdateKitchenTicketStatut, useRestoOrderItems,
  type RestoKitchenTicket,
} from "@/lib/data/restoHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/cuisine")({
  component: CuisinePage,
});

function elapsedLabel(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 1 ? "à l'instant" : `${mins} min`;
}

function CuisinePage() {
  const { data: tickets = [], isLoading } = useRestoKitchenTickets();
  // Force un nouveau rendu chaque minute pour rafraîchir les libellés
  // "il y a N min" sans dépendre d'un nouveau fetch réseau.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const waiting = tickets.filter((t) => t.statut === "en_attente");
  const preparing = tickets.filter((t) => t.statut === "en_preparation");

  return (
    <div>
      <PageHeader title="Cuisine" subtitle="Tickets en temps réel" />
      <div className="p-4 sm:p-8">
        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center text-sm text-muted-foreground">
            <ChefHat className="mx-auto mb-2 h-8 w-8 opacity-40" /> Aucun ticket en attente. Service tranquille.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <TicketColumn title="En attente" icon={<Clock3 className="h-4 w-4" />} tickets={waiting} />
            <TicketColumn title="En préparation" icon={<Flame className="h-4 w-4" />} tickets={preparing} />
          </div>
        )}
      </div>
    </div>
  );
}

function TicketColumn({ title, icon, tickets }: { title: string; icon: React.ReactNode; tickets: RestoKitchenTicket[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{icon} {title} ({tickets.length})</div>
      <div className="space-y-3">
        {tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Rien ici.</div>
        ) : (
          tickets.map((t) => <TicketCard key={t.id} ticket={t} />)
        )}
      </div>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: RestoKitchenTicket }) {
  const { data: items = [], isLoading } = useRestoOrderItems(ticket.order_id);
  const updateStatut = useUpdateKitchenTicketStatut();
  const activeItems = items.filter((i) => i.statut_ligne !== "annulee");
  const label = ticket.order?.type === "salle" ? `Table ${ticket.order?.table?.numero ?? "?"}` : ticket.order?.type === "emporter" ? "À emporter" : "Livraison";

  return (
    <div className={cn("rounded-2xl border bg-card p-4", ticket.statut === "en_preparation" ? "border-warning/40" : "border-border")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-sm font-bold">{label}</span>
        <span className="text-xs text-muted-foreground">{elapsedLabel(ticket.created_at)}</span>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="mb-3 space-y-1 text-sm">
          {activeItems.map((it) => (
            <li key={it.id}>
              <div>{it.quantite}× {it.menu_item?.nom ?? "Article"}</div>
              {it.modifiers_choisis.length > 0 && (
                <div className="pl-4 text-xs text-muted-foreground">{it.modifiers_choisis.map((m) => m.nom).join(", ")}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      {ticket.statut === "en_attente" ? (
        <button onClick={() => updateStatut.mutate({ id: ticket.id, statut: "en_preparation" })} disabled={updateStatut.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-warning/15 py-2 text-sm font-bold text-warning-foreground hover:bg-warning/25 disabled:opacity-50">
          <Flame className="h-4 w-4" /> Démarrer la préparation
        </button>
      ) : (
        <button onClick={() => updateStatut.mutate({ id: ticket.id, statut: "pret" })} disabled={updateStatut.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-success/15 py-2 text-sm font-bold text-success hover:bg-success/25 disabled:opacity-50">
          <CheckCircle2 className="h-4 w-4" /> Marquer prêt
        </button>
      )}
    </div>
  );
}
