import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [dark]);

  return (
    <button
      onClick={() => setDark((v) => !v)}
      className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted"
      aria-label="Basculer le thème"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
