import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useProducts, useCategories, useMyRole } from "@/lib/data/hooks";
import { ProductForm } from "@/components/app/ProductForm";

export const Route = createFileRoute("/app/produits/$productId")({
  component: EditProduitPage,
});

function EditProduitPage() {
  const { productId } = Route.useParams();
  const { data: products = [], isLoading } = useProducts();
  const { data: cats = [] } = useCategories();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "stock";

  const product = products.find((p) => p.id === productId);

  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!product) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Produit introuvable.</div>;
  }

  return <ProductForm initial={product} cats={cats} canManage={canManage} />;
}
