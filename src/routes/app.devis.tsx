import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/app/devis")({
  component: DevisPlaceholder,
});

function DevisPlaceholder() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold">Module Devis</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Créez des devis et convertissez-les en facture en un clic. Ce module sera
          livré dans le sous-bloc C (modules métier).
        </p>
      </div>
    </div>
  );
}
