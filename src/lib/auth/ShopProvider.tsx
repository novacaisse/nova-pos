import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthProvider";

export type Shop = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  country: string;
  logo_url: string | null;
  plan: string;
  trial_ends_at: string | null;
};

type ShopCtx = {
  shops: Shop[];
  currentShop: Shop | null;
  setCurrentShopId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ShopCtx | null>(null);
const LS_KEY = "novacaisse.currentShopId";

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(
    typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null,
  );
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setShops([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("shops")
      .select("id,name,slug,currency,country,logo_url,plan,trial_ends_at")
      .order("created_at", { ascending: true });
    if (!error && data) setShops(data as Shop[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!currentId && shops.length > 0) {
      setCurrentId(shops[0].id);
    }
    if (currentId && shops.length > 0 && !shops.find((s) => s.id === currentId)) {
      setCurrentId(shops[0].id);
    }
  }, [shops, currentId]);

  const setCurrentShopId = (id: string) => {
    setCurrentId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, id);
  };

  const currentShop = shops.find((s) => s.id === currentId) ?? null;

  return (
    <Ctx.Provider value={{ shops, currentShop, setCurrentShopId, loading, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useShop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}
