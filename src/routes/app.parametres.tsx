import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Store, Coins, Receipt, ArrowLeftRight, Save, Plus, Image as ImageIcon, FileText } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SHOPS } from "@/lib/mock/session";
import { PRODUCTS, formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/parametres")({
  component: ParametresPage,
});

type TicketConfig = {
  showLogo: boolean; showAddress: boolean; showPhone: boolean;
  showFiscal: boolean; showCashier: boolean; showQr: boolean;
  thanks: string; footer: string;
};

const DEFAULT_TICKET: TicketConfig = {
  showLogo: true, showAddress: true, showPhone: true,
  showFiscal: true, showCashier: true, showQr: false,
  thanks: "Merci pour votre achat !", footer: "À bientôt chez nous",
};

function ParametresPage() {
  const [tab, setTab] = useState<"shop" | "currency" | "taxes" | "ticket" | "transfer">("shop");

  // shop info (persisted locally so the receipt can read them)
  const [logo, setLogo] = useState<string | null>(null);
  const [shop, setShop] = useState({
    name: "Boutique Cotonou Centre", city: "Cotonou", phone: "+229 21 30 40 50",
    email: "contact@novacaisse.bj", address: "Rue 12.345, Cotonou",
    rccm: "RCCM COT/2024/B/1234", ifu: "3202400123456",
    facebook: "novacaisse.bj", instagram: "@novacaisse",
  });
  const [ticket, setTicket] = useState<TicketConfig>(DEFAULT_TICKET);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLogo(localStorage.getItem("nc_shop_logo"));
    setShop((s) => ({
      ...s,
      name: localStorage.getItem("nc_shop_name") ?? s.name,
      address: localStorage.getItem("nc_shop_address") ?? s.address,
      phone: localStorage.getItem("nc_shop_phone") ?? s.phone,
    }));
    const t = localStorage.getItem("nc_ticket_cfg");
    if (t) try { setTicket(JSON.parse(t)); } catch {}
  }, []);

  const saveShop = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem("nc_shop_name", shop.name);
    localStorage.setItem("nc_shop_address", shop.address);
    localStorage.setItem("nc_shop_phone", shop.phone);
    if (logo) localStorage.setItem("nc_shop_logo", logo); else localStorage.removeItem("nc_shop_logo");
  };
  const saveTicket = () => {
    localStorage.setItem("nc_ticket_cfg", JSON.stringify(ticket));
    localStorage.setItem("nc_ticket_thanks", ticket.thanks);
  };

  const onLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration de votre boutique" />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="space-y-1 rounded-2xl border border-border bg-card p-2">
            {([
              { k: "shop", label: "Boutique", icon: Store },
              { k: "currency", label: "Devise", icon: Coins },
              { k: "taxes", label: "Taxes", icon: Receipt },
              { k: "ticket", label: "Ticket de caisse", icon: FileText },
              { k: "transfer", label: "Transfert de stock", icon: ArrowLeftRight },
            ] as const).map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  tab === t.k ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted")}>
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {tab === "shop" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Informations de la boutique</h2>

              <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-border p-4">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl bg-muted">
                  {logo ? <img src={logo} alt="Logo" className="h-full w-full object-contain" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Logo de la boutique</div>
                  <p className="mb-2 text-xs text-muted-foreground">Appliqué automatiquement sur les reçus, factures et devis (PNG/JPG, max 1 Mo).</p>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                    Choisir un fichier
                  </label>
                  {logo && <button onClick={() => setLogo(null)} className="ml-2 text-xs text-destructive hover:underline">Retirer</button>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom" value={shop.name} onChange={(v) => setShop({ ...shop, name: v })} />
                <Field label="Ville" value={shop.city} onChange={(v) => setShop({ ...shop, city: v })} />
                <Field label="Téléphone" value={shop.phone} onChange={(v) => setShop({ ...shop, phone: v })} />
                <Field label="Email" value={shop.email} onChange={(v) => setShop({ ...shop, email: v })} />
                <Field label="Adresse complète" value={shop.address} onChange={(v) => setShop({ ...shop, address: v })} className="sm:col-span-2" />
                <Field label="RCCM" value={shop.rccm} onChange={(v) => setShop({ ...shop, rccm: v })} />
                <Field label="IFU / N° fiscal" value={shop.ifu} onChange={(v) => setShop({ ...shop, ifu: v })} />
                <Field label="Facebook" value={shop.facebook} onChange={(v) => setShop({ ...shop, facebook: v })} />
                <Field label="Instagram" value={shop.instagram} onChange={(v) => setShop({ ...shop, instagram: v })} />
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">Boutiques multiples</div>
                  <button className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Ajouter</button>
                </div>
                <div className="space-y-2">
                  {SHOPS.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Store className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.city} · Plan {s.plan}</div>
                      </div>
                      <button className="rounded-lg px-2 py-1 text-xs font-medium text-primary hover:underline">Modifier</button>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={saveShop} className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                <Save className="h-4 w-4" /> Enregistrer
              </button>
            </div>
          )}

          {tab === "currency" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Devise et affichage</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Devise principale" options={["FCFA (XOF)", "EUR", "USD", "GHS", "NGN"]} />
                <SelectField label="Position du symbole" options={["Après (500 F)", "Avant ($ 500)"]} />
                <SelectField label="Séparateur milliers" options={["Espace (10 000)", "Virgule (10,000)", "Point (10.000)"]} />
                <Field label="Décimales" defaultValue="0" />
              </div>
            </div>
          )}

          {tab === "taxes" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Taxes appliquées</h2>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Nom</th><th className="px-3 py-2 text-right">Taux</th>
                      <th className="px-3 py-2">Portée</th><th className="px-3 py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border/60"><td className="px-3 py-2 font-medium">TVA standard</td><td className="tabular px-3 py-2 text-right">18%</td><td className="px-3 py-2 text-xs">Tous produits</td><td className="px-3 py-2"><span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">Active</span></td></tr>
                    <tr className="border-t border-border/60"><td className="px-3 py-2 font-medium">TVA réduite</td><td className="tabular px-3 py-2 text-right">5%</td><td className="px-3 py-2 text-xs">Épicerie</td><td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Inactive</span></td></tr>
                  </tbody>
                </table>
              </div>
              <button className="mt-4 flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> Ajouter une taxe</button>
            </div>
          )}

          {tab === "ticket" && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="mb-4 font-display text-lg font-bold">Éditeur de ticket de caisse</h2>
                <div className="space-y-2">
                  {([
                    ["showLogo", "Afficher le logo"], ["showAddress", "Afficher l'adresse"],
                    ["showPhone", "Afficher le téléphone"], ["showFiscal", "Afficher RCCM / IFU"],
                    ["showCashier", "Afficher le caissier"], ["showQr", "Ajouter un QR code (à venir)"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                      <span>{label}</span>
                      <input type="checkbox" checked={ticket[k]} onChange={(e) => setTicket({ ...ticket, [k]: e.target.checked })} className="h-5 w-5 accent-primary" />
                    </label>
                  ))}
                  <Field label="Message de remerciement" value={ticket.thanks} onChange={(v) => setTicket({ ...ticket, thanks: v })} />
                  <Field label="Pied de page" value={ticket.footer} onChange={(v) => setTicket({ ...ticket, footer: v })} />
                </div>
                <button onClick={saveTicket} className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  <Save className="h-4 w-4" /> Enregistrer
                </button>
              </div>

              <div className="sticky top-20">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aperçu</div>
                <div className="rounded-2xl bg-white p-5 text-black shadow-elegant" style={{ fontFamily: "monospace" }}>
                  {ticket.showLogo && logo && <img src={logo} alt="" className="mx-auto mb-2 h-14 w-14 object-contain" />}
                  <div className="text-center">
                    <div className="text-sm font-bold">{shop.name}</div>
                    {ticket.showAddress && <div className="text-xs">{shop.address}</div>}
                    {ticket.showPhone && <div className="text-xs">{shop.phone}</div>}
                    {ticket.showFiscal && <div className="text-xs">IFU {shop.ifu}</div>}
                  </div>
                  <hr className="my-2 border-dashed" />
                  <div className="flex justify-between text-xs"><span>Ticket</span><span className="font-bold">T-1234</span></div>
                  {ticket.showCashier && <div className="flex justify-between text-xs"><span>Caissier</span><span>Aïcha K.</span></div>}
                  <hr className="my-2 border-dashed" />
                  <div className="text-xs">Coca-Cola 33cl × 2 · 1 000 F</div>
                  <div className="text-xs">Eau minérale × 1 · 400 F</div>
                  <hr className="my-2 border-dashed" />
                  <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>1 400 F</span></div>
                  <div className="mt-3 text-center text-xs italic">{ticket.thanks}</div>
                  <div className="text-center text-[10px] text-gray-600">{ticket.footer}</div>
                </div>
              </div>
            </div>
          )}

          {tab === "transfer" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Transfert de stock entre boutiques</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Depuis" options={SHOPS.map((s) => s.name)} />
                <SelectField label="Vers" options={SHOPS.map((s) => s.name)} />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produits à transférer</div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                  {PRODUCTS.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-base">{p.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">Stock : {p.stock} · {formatXOF(p.price)}</div>
                      </div>
                      <input type="number" min={0} defaultValue={0} className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm" />
                    </div>
                  ))}
                </div>
              </div>
              <button className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                <ArrowLeftRight className="h-4 w-4" /> Créer le transfert
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, className, defaultValue }: { label: string; value?: string; onChange?: (v: string) => void; className?: string; defaultValue?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} defaultValue={defaultValue} onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function SelectField({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}
