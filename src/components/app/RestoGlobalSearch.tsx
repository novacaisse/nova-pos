// Recherche globale ZegResto — pendant de GlobalSearch.tsx (ZegCaisse) et
// HotelGlobalSearch.tsx (ZegHotel), jamais le même composant : cherche
// tables, articles du menu et réservations, pas produits/ventes ZegCaisse
// ni chambres/clients ZegHotel (audit isolation ZegOS, Partie A).
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, DoorClosed, UtensilsCrossed, CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useRestoTables, useRestoMenuItems, useRestoReservations } from "@/lib/data/restoHooks";

export function RestoGlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: tables = [] } = useRestoTables();
  const { data: items = [] } = useRestoMenuItems();
  const { data: reservations = [] } = useRestoReservations();

  const needle = q.trim().toLowerCase();
  const hasQuery = needle.length > 0;

  const matchedTables = useMemo(() => !hasQuery ? [] : tables.filter((t) =>
    t.numero.toLowerCase().includes(needle),
  ).slice(0, 5), [tables, needle, hasQuery]);

  const matchedItems = useMemo(() => !hasQuery ? [] : items.filter((i) =>
    i.nom.toLowerCase().includes(needle),
  ).slice(0, 5), [items, needle, hasQuery]);

  const matchedReservations = useMemo(() => !hasQuery ? [] : reservations.filter((r) =>
    r.nom_client.toLowerCase().includes(needle) || (r.telephone_client ?? "").toLowerCase().includes(needle),
  ).slice(0, 5), [reservations, needle, hasQuery]);

  const totalResults = matchedTables.length + matchedItems.length + matchedReservations.length;
  const close = () => { setOpen(false); setQ(""); };

  return (
    <Popover open={open && hasQuery}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Escape") close(); }}
            placeholder="Rechercher table, plat, réservation…"
            className="w-full rounded-xl border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:bg-background" />
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-96 w-[min(420px,90vw)] overflow-y-auto p-1.5">
        {totalResults === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Aucun résultat pour « {q} »</div>
        ) : (
          <div className="space-y-1">
            {matchedTables.length > 0 && (
              <ResultGroup label="Tables" icon={DoorClosed}>
                {matchedTables.map((t) => (
                  <Link key={t.id} to="/app/resto/salle" onClick={close}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-medium">Table {t.numero}</div>
                      <div className="text-xs text-muted-foreground">{t.capacite} couverts · {t.statut}</div>
                    </div>
                  </Link>
                ))}
              </ResultGroup>
            )}
            {matchedItems.length > 0 && (
              <ResultGroup label="Menu" icon={UtensilsCrossed}>
                {matchedItems.map((i) => (
                  <Link key={i.id} to="/app/resto/menu" onClick={close}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                    <div className="min-w-0 truncate font-medium">{i.nom}</div>
                  </Link>
                ))}
              </ResultGroup>
            )}
            {matchedReservations.length > 0 && (
              <ResultGroup label="Réservations" icon={CalendarClock}>
                {matchedReservations.map((r) => (
                  <Link key={r.id} to="/app/resto/reservations" onClick={close}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.nom_client}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.date_heure).toLocaleString("fr-FR")}</div>
                    </div>
                  </Link>
                ))}
              </ResultGroup>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ResultGroup({ label, icon: Icon, children }: { label: string; icon: typeof DoorClosed; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}
