import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateEmail: (newEmail: string) => Promise<{ error: string | null }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signUp(email, password, fullName) {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/app` : undefined;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: redirectTo },
      });
      return { error: error?.message ?? null };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async updateEmail(newEmail) {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      return { error: error?.message ?? null };
    },
    async updatePassword(currentPassword, newPassword) {
      const email = session?.user.email;
      if (!email) return { error: "Session invalide." };
      // Revérifie l'ancien mot de passe avant de le changer, pour qu'une
      // session oubliée ouverte ne suffise pas à elle seule.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (reauthErr) return { error: "Mot de passe actuel incorrect." };
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error: error?.message ?? null };
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
