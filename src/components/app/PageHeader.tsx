import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border bg-card/50 px-5 py-5 sm:px-8">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  trend,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: string; positive: boolean };
  icon?: ReactNode;
  accent?: "primary" | "accent" | "success" | "destructive";
}) {
  const accentClass =
    accent === "accent"
      ? "from-accent/20 to-accent/5 text-accent-foreground"
      : accent === "success"
        ? "from-success/20 to-success/5 text-success"
        : accent === "destructive"
          ? "from-destructive/20 to-destructive/5 text-destructive"
          : "from-primary/20 to-primary/5 text-primary";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="tabular mt-1.5 font-display text-2xl font-bold tracking-tight">{value}</div>
          {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && (
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accentClass}`}>
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div
          className={`mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            trend.positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          }`}
        >
          {trend.positive ? "▲" : "▼"} {trend.value}
        </div>
      )}
    </div>
  );
}
