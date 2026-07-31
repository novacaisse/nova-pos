// Recherche globale ZegHotel — pendant de GlobalSearch.tsx (ZegCaisse),
// jamais le même composant : cherche chambres et clients/réservations
// hôtel, pas produits/ventes (audit isolation ZegOS, Partie A). Les
// résultats renvoient vers les pages liste (Chambres/Réservations) — ni
// hotel_rooms ni hotel_reservations n'ont de route de détail adressable
// par URL aujourd'hui (drawer en état local), contrairement aux produits/
// ventes côté ZegCaisse.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, DoorClosed, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useHotelRooms, useHotelGuests } from "@/lib/data/hotelHooks";

export function HotelGlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: rooms = [] } = useHotelRooms();
  const needle = q.trim().toLowerCase();
  const hasQuery = needle.length > 0;
  const { data: guests = [] } = useHotelGuests(hasQuery ? q : undefined);

  const matchedRooms = useMemo(() => !hasQuery ? [] : rooms.filter((r) =>
    r.number.toLowerCase().includes(needle) || (r.room_type?.name ?? "").toLowerCase().includes(needle),
  ).slice(0, 5), [rooms, needle, hasQuery]);

  const matchedGuests = guests.slice(0, 5);
  const totalResults = matchedRooms.length + matchedGuests.length;
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
            placeholder="Rechercher chambre, client…"
            className="w-full rounded-xl border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:bg-background" />
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-96 w-[min(420px,90vw)] overflow-y-auto p-1.5">
        {totalResults === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Aucun résultat pour « {q} »</div>
        ) : (
          <div className="space-y-1">
            {matchedRooms.length > 0 && (
              <ResultGroup label="Chambres" icon={DoorClosed}>
                {matchedRooms.map((r) => (
                  <Link key={r.id} to="/app/hotel/rooms" onClick={close}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-medium">Chambre {r.number}</div>
                      <div className="text-xs text-muted-foreground">{r.room_type?.name ?? "—"}</div>
                    </div>
                  </Link>
                ))}
              </ResultGroup>
            )}
            {matchedGuests.length > 0 && (
              <ResultGroup label="Clients" icon={Users}>
                {matchedGuests.map((g) => (
                  <Link key={g.id} to="/app/hotel/reservations" onClick={close}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{g.full_name}</div>
                      <div className="text-xs text-muted-foreground">{g.phone ?? g.email ?? "—"}</div>
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
