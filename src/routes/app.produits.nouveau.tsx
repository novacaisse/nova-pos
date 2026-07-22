import { createFileRoute } from "@tanstack/react-router";
import { useCategories, useMyRole } from "@/lib/data/hooks";
import { ProductForm } from "@/components/app/ProductForm";

export const Route = createFileRoute("/app/produits/nouveau")({
  component: NouveauProduitPage,
});

function NouveauProduitPage() {
  const { data: cats = [] } = useCategories();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "stock";

  return (
    <ProductForm
      initial={{ name: "", price: 0, cost: 0, unit: "pcs", is_active: true, low_stock_threshold: 5, tax_rate: 0 }}
      cats={cats}
      canManage={canManage}
    />
  );
}
