export type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email?: string;
  city: string;
  category: string;
  outstanding: number;
  last_order: string;
};

export type PurchaseOrder = {
  id: string;
  ref: string;
  supplier_id: string;
  supplier_name: string;
  created_at: string;
  expected_at: string;
  items_count: number;
  total: number;
  status: "brouillon" | "envoyée" | "reçue" | "partielle" | "annulée";
};

export const SUPPLIERS: Supplier[] = [
  { id: "sup1", name: "Boissons Afrique SA", contact: "M. Zinsou", phone: "+229 21 30 40 50", email: "contact@bafrique.bj", city: "Cotonou", category: "Boissons", outstanding: 450000, last_order: "2026-07-05" },
  { id: "sup2", name: "GrossMart Import", contact: "Mme Lawson", phone: "+229 21 31 22 44", city: "Cotonou", category: "Épicerie", outstanding: 0, last_order: "2026-07-02" },
  { id: "sup3", name: "HygièneProd", contact: "M. Kponou", phone: "+229 21 33 55 77", city: "Porto-Novo", category: "Hygiène", outstanding: 120000, last_order: "2026-06-28" },
  { id: "sup4", name: "SnackCorp", contact: "M. Adékambi", phone: "+229 21 44 66 88", city: "Cotonou", category: "Snacks", outstanding: 0, last_order: "2026-07-08" },
  { id: "sup5", name: "MaisonPlus", contact: "Mme Codjo", phone: "+229 21 55 77 99", city: "Abomey-Calavi", category: "Maison", outstanding: 78000, last_order: "2026-06-25" },
];

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  { id: "po1", ref: "BC-2026-042", supplier_id: "sup1", supplier_name: "Boissons Afrique SA", created_at: "2026-07-05", expected_at: "2026-07-12", items_count: 14, total: 850000, status: "envoyée" },
  { id: "po2", ref: "BC-2026-041", supplier_id: "sup2", supplier_name: "GrossMart Import", created_at: "2026-07-02", expected_at: "2026-07-06", items_count: 22, total: 1240000, status: "reçue" },
  { id: "po3", ref: "BC-2026-040", supplier_id: "sup3", supplier_name: "HygièneProd", created_at: "2026-06-28", expected_at: "2026-07-04", items_count: 9, total: 320000, status: "partielle" },
  { id: "po4", ref: "BC-2026-039", supplier_id: "sup4", supplier_name: "SnackCorp", created_at: "2026-07-08", expected_at: "2026-07-14", items_count: 18, total: 540000, status: "brouillon" },
  { id: "po5", ref: "BC-2026-038", supplier_id: "sup5", supplier_name: "MaisonPlus", created_at: "2026-06-25", expected_at: "2026-07-01", items_count: 6, total: 195000, status: "reçue" },
];
