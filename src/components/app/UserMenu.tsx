import { Link, useNavigate } from "@tanstack/react-router";
import { UserCircle, KeyRound, CreditCard, LogOut, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CURRENT_USER } from "@/lib/mock/session";

const ROLE_LABEL: Record<string, string> = {
  gerant: "Gérant",
  vendeur: "Vendeur",
  caissier: "Caissier",
  super_admin: "Super Admin",
};

export function UserMenu() {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1 pl-1 pr-2.5 transition-colors hover:bg-muted">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-xs font-bold text-primary-foreground">
            {CURRENT_USER.avatar_initials}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-xs font-semibold text-foreground">{CURRENT_USER.full_name}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {ROLE_LABEL[CURRENT_USER.role] ?? CURRENT_USER.role}
            </div>
          </div>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-sm font-bold text-primary-foreground">
            {CURRENT_USER.avatar_initials}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">{CURRENT_USER.full_name}</div>
            <div className="text-[11px] text-muted-foreground">
              {ROLE_LABEL[CURRENT_USER.role] ?? CURRENT_USER.role}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/profil" className="cursor-pointer gap-2.5">
            <UserCircle className="h-4 w-4" />
            Modifier le profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/profil" className="cursor-pointer gap-2.5">
            <KeyRound className="h-4 w-4" />
            Modifier le mot de passe
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/abonnement" className="cursor-pointer gap-2.5">
            <CreditCard className="h-4 w-4" />
            Gérer mon abonnement
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate({ to: "/connexion" })}
          className="cursor-pointer gap-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
