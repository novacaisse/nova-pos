import { useState } from "react";
import { Check, ChevronsUpDown, Store } from "lucide-react";
import { SHOPS } from "@/lib/mock/session";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function ShopSelector() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(SHOPS[0].id);
  const active = SHOPS.find((s) => s.id === activeId)!;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60"
          aria-label="Changer de boutique"
        >
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Boutique</div>
            <div className="truncate text-sm font-semibold text-foreground">{active.name}</div>
          </div>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Vos boutiques
        </div>
        {SHOPS.map((s) => {
          const isActive = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => {
                setActiveId(s.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                isActive ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                <Store className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.city} · Plan {s.plan}
                </div>
              </div>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
        <div className="mt-1 border-t pt-1">
          <button className="w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-primary hover:bg-primary/5">
            + Ajouter une boutique
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
