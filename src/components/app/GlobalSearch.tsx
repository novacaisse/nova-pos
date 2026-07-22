import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Package, Users, Receipt } from "lucide-react";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useProducts, useCustomers, useSales, useFormatMoney } from "@/lib/data/hooks";

export function GlobalSearch() {
  const formatXOF = useFormatMoney();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: sales = [] } = useSales(100);

  const needle = q.trim().toLowerCase();
  const hasQuery = needle.length > 0;

  const matchedProducts = useMemo(() => !hasQuery ? [] : products.filter((p) =>
    p.name.toLowerCase().includes(needle)
    || (p.sku ?? "").toLowerCase().includes(needle)
    || (p.barcode ?? "").toLowerCase().includes(needle),
  ).slice(0, 5), [products, needle, hasQuery]);

  const matchedCustomers = useMemo(() => !hasQuery ? [] : customers.filter((c) =>
    c.name.toLowerCase().includes(needle)
    || (c.phone ?? "").toLowerCase().includes(needle)
    || (c.email ?? "").toLowerCase().includes(needle),
  ).slice(0, 5), [customers, needle, hasQuery]);

  const matchedSales = useMemo(() => !hasQuery ? [] : sales.filter((s) =>
    s.reference.toLowerCase().includes(needle)
    || (s.customers?.name ?? "").toLowerCase().includes(needle),
  ).slice(0, 5), [sales, needle, hasQuery]);

  const totalResults = matchedProducts.length + matchedCustomers.length + matchedSales.length;
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
            placeholder="Rechercher produit, client, ticket…"
            className="w-full rounded-xl border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:bg-background" />
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-96 w-[min(420px,90vw)] overflow-y-auto p-1.5">
        {totalResults === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Aucun résultat pour « {q} »</div>
        ) : (
          <div className="space-y-1">
            {matchedProducts.length > 0 && (
              <ResultGroup label="Produits" icon={Package}>
                {matchedProducts.map((p) => (
                  <Link key={p.id} to="/app/produits" search={{ q: p.name }} onClick={close}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.sku ?? "—"} · Stock {p.stock}</div>
                    </div>
                    <div className="tabular shrink-0 text-xs font-semibold text-primary">{formatXOF(Number(p.price))}</div>
                  </Link>
                ))}
              </ResultGroup>
            )}
            {matchedCustomers.length > 0 && (
              <ResultGroup label="Clients" icon={Users}>
                {matchedCustomers.map((c) => (
                  <Link key={c.id} to="/app/clients" search={{ q: c.name }} onClick={close}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone ?? c.email ?? "—"}</div>
                    </div>
                  </Link>
                ))}
              </ResultGroup>
            )}
            {matchedSales.length > 0 && (
              <ResultGroup label="Ventes" icon={Receipt}>
                {matchedSales.map((s) => (
                  <Link key={s.id} to="/app/ventes" search={{ q: s.reference }} onClick={close}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs font-semibold">{s.reference}</div>
                      <div className="text-xs text-muted-foreground">{s.customers?.name ?? "Comptoir"}</div>
                    </div>
                    <div className="tabular shrink-0 text-xs font-semibold text-primary">{formatXOF(Number(s.total))}</div>
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

function ResultGroup({ label, icon: Icon, children }: { label: string; icon: typeof Package; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}
