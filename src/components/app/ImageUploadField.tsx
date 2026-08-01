// Composant d'upload d'image générique — Supabase Storage direct (bucket +
// chemin passés en props, l'appelant reste responsable de la convention de
// chemin, ex. `{organization_id}/{menu_item_id}` comme product-images).
// Écrit pour le besoin ZegResto V2 (photos d'articles du menu, bucket
// resto-menu-photos), mais volontairement générique — pas de dépendance à
// resto_* — pour être réutilisable tel quel ailleurs dans ZegOS sans
// modification. N'implémente qu'un seul appelant (ZegResto) dans cette
// session, comme demandé.
import { useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function ImageUploadField({ bucket, path, value, onChange, label, className }: {
  bucket: string;
  path: string;
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  className?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { error: upErr } = await supabase.storage.from(bucket)
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(`${data.publicUrl}?v=${Date.now()}`);
    } catch (e: any) {
      setError(e?.message ?? "Erreur d'upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={className}>
      {label && <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div>}
      <div className="flex items-center gap-3">
        <div className={cn("grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted")}>
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            {/* Pas de `capture` : laisse le sélecteur natif mobile proposer
               galerie ET appareil photo, plutôt que forcer l'un des deux. */}
            <input type="file" accept="image/*" className="hidden" disabled={uploading}
              onChange={(e) => pick(e.target.files?.[0])} />
            {value ? "Changer la photo" : "Ajouter une photo"}
          </label>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="text-xs text-destructive hover:underline">
              Retirer
            </button>
          )}
        </div>
      </div>
      {error && <div className="mt-1.5 text-xs text-destructive">{error}</div>}
    </div>
  );
}
