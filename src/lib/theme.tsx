// Préférence de thème partagée (ThemeToggle + Profil → Préférences).
// Préférence d'affichage pure : localStorage suffit, pas besoin de Supabase.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePref = "light" | "dark" | "auto";
const KEY = "novacaisse.theme";

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function resolveDark(pref: ThemePref) {
  return pref === "auto" ? systemPrefersDark() : pref === "dark";
}

type ThemeCtx = { theme: ThemePref; setTheme: (t: ThemePref) => void; isDark: boolean };
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => {
    if (typeof window === "undefined") return "auto";
    return (localStorage.getItem(KEY) as ThemePref | null) ?? "auto";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolveDark(theme));
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => document.documentElement.classList.toggle("dark", mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (t: ThemePref) => {
    setThemeState(t);
    if (typeof window !== "undefined") localStorage.setItem(KEY, t);
  };

  return <Ctx.Provider value={{ theme, setTheme, isDark: resolveDark(theme) }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
