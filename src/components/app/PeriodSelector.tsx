import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type Period = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "year" | "custom";

export const PERIOD_LABEL: Record<Period, string> = {
  today: "Aujourd'hui", yesterday: "Hier", week: "Cette semaine", last_week: "Semaine dernière",
  month: "Ce mois", last_month: "Mois dernier", year: "Cette année", custom: "Personnalisé",
};

export function periodRange(period: Period, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const d = (base: Date, days: number) => { const x = new Date(base); x.setDate(x.getDate() + days); return x; };
  switch (period) {
    case "today": return { from: start, to: end };
    case "yesterday": return { from: d(start, -1), to: d(end, -1) };
    case "week": { const from = d(start, -((start.getDay() + 6) % 7)); return { from, to: end }; }
    case "last_week": { const from = d(start, -((start.getDay() + 6) % 7) - 7); return { from, to: d(from, 6) }; }
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: end };
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from, to };
    }
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: end };
    case "custom": {
      const from = customFrom ? new Date(customFrom) : start;
      const to = customTo ? new Date(customTo + "T23:59:59") : end;
      return { from, to };
    }
  }
}

export function PeriodSelector({
  period, onChange, customFrom, customTo, onCustomFromChange, onCustomToChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {PERIOD_LABEL[period]}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-60 p-1.5">
        <div className="flex flex-col gap-0.5">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button key={p} onClick={() => { onChange(p); if (p !== "custom") setOpen(false); }}
              className={cn("rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                period === p ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="mt-1 space-y-2 border-t border-border p-2 pt-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Du</span>
              <input type="date" value={customFrom} onChange={(e) => onCustomFromChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Au</span>
              <input type="date" value={customTo} onChange={(e) => onCustomToChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm" />
            </label>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
