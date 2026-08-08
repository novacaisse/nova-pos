// Écran KDS (Kitchen Display System) ZegResto — flux unique, pas de
// routage multi-poste (resto_menu_items.station existe pour ça mais n'est
// pas exploité). Mis à jour en temps réel via Supabase Realtime
// (postgres_changes sur resto_kitchen_tickets/resto_order_items), avec un
// filet de sécurité refetchInterval configurable si la connexion websocket
// tombe (V2, resto_settings.kds_auto_refresh_seconds).
//
// V2 : seuil d'urgence configurable (ticket surligné passé N minutes,
// resto_settings.kds_urgency_minutes), marquage par ligne (le cuisinier
// peut cocher un plat prêt indépendamment du reste du ticket, via
// mark_resto_order_item_statut()) en plus du statut global du ticket, et
// alerte sonore configurable à l'arrivée d'un nouveau ticket.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ChefHat, Flame, CheckCircle2, Clock3, AlertTriangle, Star, Printer } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import {
  useRestoKitchenTickets, useUpdateKitchenTicketStatut, useRestoOrderItems, useUpdateRestoOrderItemStatut,
  useRestoSettings, RESTO_SETTINGS_DEFAULTS, useToggleKitchenTicketPriorite, useRestoOrderItemsByOrderIds,
  type RestoKitchenTicket, type RestoOrderItem,
} from "@/lib/data/restoHooks";
import { playKdsSound } from "@/lib/kdsSound";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/cuisine")({
  component: CuisinePage,
});

// #18 (Round 3 Phase B) : routage KDS multi-poste — resto_menu_items.station
// existait déjà (schéma) mais n'était exploité nulle part côté KDS. "Tous"
// reste l'onglet par défaut : un petit établissement avec un seul poste ne
// doit rien reconfigurer pour continuer à tout voir comme avant.
const ALL_STATIONS = "__toutes__";

function elapsedMinutes(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}
function elapsedLabel(mins: number) {
  return mins < 1 ? "à l'instant" : `${mins} min`;
}

function CuisinePage() {
  const { data: settingsRow } = useRestoSettings();
  const settings = { ...RESTO_SETTINGS_DEFAULTS, ...settingsRow };
  const { data: tickets = [], isLoading } = useRestoKitchenTickets(settings.kds_auto_refresh_seconds * 1000);
  // Force un nouveau rendu chaque minute pour rafraîchir les libellés
  // "il y a N min" et le surlignage d'urgence sans dépendre d'un nouveau
  // fetch réseau.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Alerte sonore : compare les ids de tickets vus au rendu précédent, joue
  // le son configuré dès qu'un nouveau ticket apparaît (première liste
  // chargée = pas d'alerte, sinon un rechargement de page sonnerait).
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = new Set(tickets.map((t) => t.id));
    if (seenIds.current) {
      const hasNew = [...currentIds].some((id) => !seenIds.current!.has(id));
      if (hasNew && settings.kds_sound_enabled) playKdsSound(settings.kds_sound_choice, settings.kds_sound_volume);
    }
    seenIds.current = currentIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets.map((t) => t.id).join(",")]);

  // #18 routage KDS multi-poste : une requête groupée pour connaître les
  // stations concernées par chaque ticket, à partir de ses lignes actives.
  const orderIds = useMemo(() => [...new Set(tickets.map((t) => t.order_id))], [tickets]);
  const { data: allItems = [] } = useRestoOrderItemsByOrderIds(orderIds);
  const itemsByOrder = useMemo(() => {
    const map = new Map<string, RestoOrderItem[]>();
    for (const it of allItems) map.set(it.order_id, [...(map.get(it.order_id) ?? []), it]);
    return map;
  }, [allItems]);
  const ticketItems = (t: RestoKitchenTicket) => (itemsByOrder.get(t.order_id) ?? []).filter((i) => !t.course_id || i.course_id === t.course_id);
  const stations = useMemo(() => [...new Set(allItems.map((i) => i.menu_item?.station).filter((s): s is string => !!s))].sort(), [allItems]);
  const [station, setStation] = useState(ALL_STATIONS);

  const scoped = station === ALL_STATIONS ? tickets : tickets.filter((t) => ticketItems(t).some((i) => i.menu_item?.station === station));
  // #23 priorisation manuelle : tickets prioritaires toujours en tête de
  // colonne, indépendamment de l'ancienneté.
  const byPriority = (list: RestoKitchenTicket[]) => [...list].sort((a, b) => Number(b.priorite) - Number(a.priorite));
  const waiting = byPriority(scoped.filter((t) => t.statut === "en_attente"));
  const preparing = byPriority(scoped.filter((t) => t.statut === "en_preparation"));

  return (
    <div>
      <PageHeader title="Cuisine" subtitle="Tickets en temps réel" />
      <div className="p-4 sm:p-8">
        {stations.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            <button onClick={() => setStation(ALL_STATIONS)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", station === ALL_STATIONS ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
              Tous les postes
            </button>
            {stations.map((s) => (
              <button key={s} onClick={() => setStation(s)}
                className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", station === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                {s}
              </button>
            ))}
          </div>
        )}
        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : scoped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center text-sm text-muted-foreground">
            <ChefHat className="mx-auto mb-2 h-8 w-8 opacity-40" /> Aucun ticket en attente. Service tranquille.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <TicketColumn title="En attente" icon={<Clock3 className="h-4 w-4" />} tickets={waiting} urgencyMinutes={settings.kds_urgency_minutes} />
            <TicketColumn title="En préparation" icon={<Flame className="h-4 w-4" />} tickets={preparing} urgencyMinutes={settings.kds_urgency_minutes} />
          </div>
        )}
      </div>
    </div>
  );
}

function TicketColumn({ title, icon, tickets, urgencyMinutes }: { title: string; icon: React.ReactNode; tickets: RestoKitchenTicket[]; urgencyMinutes: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{icon} {title} ({tickets.length})</div>
      <div className="space-y-3">
        {tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Rien ici.</div>
        ) : (
          tickets.map((t) => <TicketCard key={t.id} ticket={t} urgencyMinutes={urgencyMinutes} />)
        )}
      </div>
    </div>
  );
}

function TicketCard({ ticket, urgencyMinutes }: { ticket: RestoKitchenTicket; urgencyMinutes: number }) {
  const { data: items = [], isLoading } = useRestoOrderItems(ticket.order_id);
  const updateStatut = useUpdateKitchenTicketStatut();
  const markLine = useUpdateRestoOrderItemStatut();
  const togglePriorite = useToggleKitchenTicketPriorite();
  // Un ticket peut désormais correspondre à une étape (course_id) plutôt
  // qu'à toute la commande — n'afficher que les lignes de cette étape,
  // sauf pour les tickets antérieurs à la migration 043 (course_id null).
  const activeItems = items.filter((i) => i.statut_ligne !== "annulee" && (!ticket.course_id || i.course_id === ticket.course_id));
  const mins = elapsedMinutes(ticket.created_at);
  const urgent = mins >= urgencyMinutes;
  const label = ticket.order?.type === "salle" ? `Table ${ticket.order?.table?.numero ?? "?"}` : ticket.order?.type === "emporter" ? "À emporter" : "Livraison";
  const courseLabel = ticket.course?.nom || (ticket.course?.ordre ? `Étape ${ticket.course.ordre}` : null);
  // #24 temps réel vs estimé : compare l'écoulé au max des temps de
  // préparation configurés parmi les articles du ticket (le plat le plus
  // long fixe le rythme, pas la moyenne).
  const estimatedMax = Math.max(0, ...activeItems.map((i) => i.menu_item?.temps_preparation_min ?? 0));
  const overEstimate = estimatedMax > 0 && mins > estimatedMax;

  return (
    <div className={cn("rounded-2xl border bg-card p-4",
      ticket.priorite ? "border-accent ring-1 ring-accent/40" : urgent ? "border-destructive/60 ring-1 ring-destructive/30" : ticket.statut === "en_preparation" ? "border-warning/40" : "border-border")}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {ticket.priorite && <Star className="h-3.5 w-3.5 fill-accent text-accent" />}
          <span className="font-display text-sm font-bold">{label}</span>
          {courseLabel && <span className="ml-1 text-xs text-muted-foreground">· {courseLabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1 text-xs font-semibold", overEstimate ? "text-destructive" : urgent ? "text-destructive" : "text-muted-foreground")}>
            {urgent && <AlertTriangle className="h-3.5 w-3.5" />} {elapsedLabel(mins)}{estimatedMax > 0 && <span className="text-muted-foreground">/{estimatedMax}min</span>}
          </span>
          <button onClick={() => togglePriorite.mutate({ id: ticket.id, priorite: !ticket.priorite })} disabled={togglePriorite.isPending}
            title="Prioriser ce ticket" className={cn("shrink-0", ticket.priorite ? "text-accent" : "text-muted-foreground hover:text-accent")}>
            <Star className={cn("h-4 w-4", ticket.priorite && "fill-accent")} />
          </button>
          <button onClick={() => printTicket(label, courseLabel, activeItems)} title="Imprimer le ticket" className="shrink-0 text-muted-foreground hover:text-foreground">
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="mb-3 space-y-1.5 text-sm">
          {activeItems.map((it) => <TicketLine key={it.id} item={it} onMarkReady={() => markLine.mutate({ id: it.id, orderId: it.order_id, statut_ligne: "pret" })} busy={markLine.isPending} />)}
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
          <CheckCircle2 className="h-4 w-4" /> Marquer le ticket prêt
        </button>
      )}
    </div>
  );
}

// #17 impression ticket cuisine (thermique) : mise en page minimale dans
// une nouvelle fenêtre, sur le modèle des reçus PDF déjà imprimés ailleurs
// dans l'app — pas de dépendance supplémentaire, window.print() suffit
// pour un ticket texte.
function printTicket(label: string, courseLabel: string | null, items: RestoOrderItem[]) {
  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) return;
  const lines = items.map((it) => `
    <div style="margin-bottom:6px;">
      <div>${it.quantite}x ${it.menu_item?.nom ?? "Article"}</div>
      ${it.modifiers_choisis.length > 0 ? `<div style="font-size:11px;padding-left:10px;">${it.modifiers_choisis.map((m) => m.nom).join(", ")}</div>` : ""}
      ${it.notes ? `<div style="font-size:11px;padding-left:10px;font-style:italic;">Note : ${it.notes}</div>` : ""}
      ${(it.menu_item?.allergenes.length ?? 0) > 0 ? `<div style="font-size:11px;padding-left:10px;">⚠ ${it.menu_item!.allergenes.join(", ")}</div>` : ""}
    </div>`).join("");
  win.document.write(`
    <html><head><title>Ticket cuisine</title></head>
    <body style="font-family:monospace;font-size:13px;width:280px;margin:0 auto;padding:12px;">
      <div style="text-align:center;font-weight:bold;margin-bottom:8px;">${label}${courseLabel ? ` — ${courseLabel}` : ""}</div>
      <div style="text-align:center;font-size:11px;margin-bottom:10px;">${new Date().toLocaleString("fr-FR")}</div>
      <hr />
      ${lines}
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

// Marquage par ligne : indépendant du statut global du ticket (utile quand
// certains plats d'un même ticket demandent plus de temps que d'autres) —
// n'entraîne pas automatiquement le passage du ticket entier à "pret",
// c'est toujours une action explicite du cuisinier sur le bouton global.
function TicketLine({ item, onMarkReady, busy }: { item: RestoOrderItem; onMarkReady: () => void; busy: boolean }) {
  const ready = item.statut_ligne === "pret" || item.statut_ligne === "servie";
  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className={cn(ready && "text-muted-foreground line-through")}>{item.quantite}× {item.menu_item?.nom ?? "Article"}</div>
        {item.modifiers_choisis.length > 0 && (
          <div className="pl-4 text-xs text-muted-foreground">{item.modifiers_choisis.map((m) => m.nom).join(", ")}</div>
        )}
        {item.notes && <div className="pl-4 text-xs italic text-accent-foreground">{item.notes}</div>}
        {(item.menu_item?.allergenes.length ?? 0) > 0 && (
          <div className="pl-4 text-xs text-warning-foreground">⚠ {item.menu_item!.allergenes.join(", ")}</div>
        )}
      </div>
      {ready ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <button onClick={onMarkReady} disabled={busy}
          className="shrink-0 rounded-md border border-success/40 px-1.5 py-0.5 text-[10px] font-bold uppercase text-success hover:bg-success/10 disabled:opacity-50">
          Prêt
        </button>
      )}
    </li>
  );
}
