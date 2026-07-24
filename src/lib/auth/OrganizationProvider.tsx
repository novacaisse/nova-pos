import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthProvider";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  country: string;
  logo_url: string | null;
  plan: string;
  trial_ends_at: string | null;
};

type OrganizationCtx = {
  organizations: Organization[];
  currentOrganization: Organization | null;
  setCurrentOrganizationId: (id: string) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<OrganizationCtx | null>(null);
const LS_KEY = "novacaisse.currentShopId";

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(
    typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null,
  );
  // Démarre à true : tant qu'on n'a pas encore tenté le premier fetch (ou
  // que l'auth n'est pas encore résolue), `organizations` est vide MAIS ça
  // ne veut pas dire "pas d'organisation" — un état initial à false créait
  // une fenêtre où AppLayout affichait NoShopScreen avant même que le
  // fetch ait démarré (bug remonté : écran "aucune boutique" qui traîne
  // après actualisation, surtout sur connexion lente).
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fetchErr } = await supabase
      .from("organizations")
      .select("id,name,slug,currency,country,logo_url,plan,trial_ends_at")
      .order("created_at", { ascending: true });
    if (fetchErr) {
      setError(fetchErr.message);
    } else if (data) {
      setOrganizations(data as Organization[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!currentId && organizations.length > 0) {
      setCurrentId(organizations[0].id);
    }
    if (currentId && organizations.length > 0 && !organizations.find((o) => o.id === currentId)) {
      setCurrentId(organizations[0].id);
    }
  }, [organizations, currentId]);

  const setCurrentOrganizationId = (id: string) => {
    setCurrentId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, id);
  };

  const currentOrganization = organizations.find((o) => o.id === currentId) ?? null;

  return (
    <Ctx.Provider value={{ organizations, currentOrganization, setCurrentOrganizationId, loading, error, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrganization must be used within OrganizationProvider");
  return ctx;
}
