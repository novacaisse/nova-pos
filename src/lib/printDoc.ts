// Gabarits HTML partagés pour tout ce qui s'imprime ou s'exporte en PDF via
// window.print() (reçus, factures proforma, devis, rapports) — avant, chaque
// écran définissait son propre style ad-hoc et minimal, sans cohérence
// visuelle ni vraie identité de document (Bloc 21 : "meilleur design des PDF").
export type LetterheadInfo = {
  shopName: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  ifu?: string | null;
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Style "lettre à en-tête" A4 — utilisé pour les documents formels
// (facture proforma, devis, rapports), par opposition au ticket de
// caisse thermique (voir THERMAL_CSS) qui reste un format 80mm distinct.
const A4_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #18181b; margin: 0; padding: 32px 40px; font-size: 13px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 3px solid #0891b2; padding-bottom: 16px; }
  .doc-header .shop { display: flex; gap: 12px; align-items: center; }
  .doc-header img.logo { width: 52px; height: 52px; object-fit: contain; border-radius: 10px; }
  .doc-header .shop-name { font-size: 18px; font-weight: 800; }
  .doc-header .shop-meta { font-size: 11px; color: #666; line-height: 1.5; margin-top: 2px; }
  .doc-header .doc-meta { text-align: right; flex-shrink: 0; }
  .doc-header .doc-title { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0891b2; }
  .doc-header .doc-number { font-size: 12px; color: #666; margin-top: 3px; }
  .doc-banner { margin: 16px 0 0; padding: 8px 14px; background: #fef3c7; color: #92400e; font-weight: 700; font-size: 11px; text-align: center; letter-spacing: 0.5px; border-radius: 8px; }
  .doc-parties { display: flex; justify-content: space-between; gap: 24px; margin-top: 20px; }
  .doc-parties .block h2 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin: 0 0 4px; }
  .doc-parties .block .name { font-size: 13px; font-weight: 700; }
  table.doc-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  table.doc-table th { background: #f0fdfa; color: #0f766e; text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; padding: 9px 10px; }
  table.doc-table td { padding: 9px 10px; border-bottom: 1px solid #eee; font-size: 12.5px; }
  table.doc-table tbody tr:nth-child(even) { background: #fafafa; }
  table.doc-table td.num, table.doc-table th.num { text-align: right; }
  .doc-totals { margin-top: 16px; margin-left: auto; width: 280px; }
  .doc-totals .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12.5px; color: #444; }
  .doc-totals .row.total { border-top: 2px solid #18181b; margin-top: 6px; padding-top: 8px; font-size: 16px; font-weight: 800; color: #18181b; }
  .doc-notes { margin-top: 20px; padding: 10px 14px; background: #fafafa; border-radius: 8px; font-size: 11.5px; color: #555; }
  .doc-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center; }
  @media print { body { padding: 0 24px; } }
`;

export function renderA4Document(opts: {
  docTitle: string;
  docNumber?: string;
  docDate?: string;
  banner?: string;
  shop: LetterheadInfo;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  const { docTitle, docNumber, docDate, banner, shop, bodyHtml, footerHtml } = opts;
  return `<html><head><title>${escapeHtml(docTitle)}</title><style>${A4_CSS}</style></head><body>
    <div class="doc-header">
      <div class="shop">
        ${shop.logoUrl ? `<img class="logo" src="${escapeHtml(shop.logoUrl)}" alt="" />` : ""}
        <div>
          <div class="shop-name">${escapeHtml(shop.shopName)}</div>
          <div class="shop-meta">
            ${shop.address ? escapeHtml(shop.address) + "<br/>" : ""}
            ${shop.phone ? escapeHtml(shop.phone) : ""}${shop.ifu ? ` · IFU ${escapeHtml(shop.ifu)}` : ""}
          </div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-title">${escapeHtml(docTitle)}</div>
        ${docNumber ? `<div class="doc-number">N° ${escapeHtml(docNumber)}</div>` : ""}
        ${docDate ? `<div class="doc-number">${escapeHtml(docDate)}</div>` : ""}
      </div>
    </div>
    ${banner ? `<div class="doc-banner">${escapeHtml(banner)}</div>` : ""}
    ${bodyHtml}
    <div class="doc-footer">${footerHtml ?? "Document généré par NovaCaisse"}</div>
  </body></html>`;
}

// Style ticket de caisse thermique (58/80mm) — pour le reçu client, un
// format volontairement différent d'un document A4 (papier rouleau).
export const THERMAL_CSS = `
  body{font-family:-apple-system,sans-serif;font-size:12px;padding:16px;color:#000}
  h1{font-size:14px;margin:0 0 4px}
  .row{display:flex;justify-content:space-between;margin:2px 0}
  hr{border:none;border-top:1px dashed #999;margin:8px 0}
  img{max-width:80px;display:block;margin:0 auto 6px}
  .center{text-align:center}.b{font-weight:700}
`;

export function openPrintWindow(html: string, opts?: { width?: number; height?: number }) {
  const w = window.open("", "_blank", `width=${opts?.width ?? 900},height=${opts?.height ?? 700}`);
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); }, 300);
}
