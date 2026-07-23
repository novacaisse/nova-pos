import { Link, useNavigate } from "@tanstack/react-router";
import { UserCircle, KeyRound, CreditCard, LogOut, ChevronDown, LifeBuoy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useProfile } from "@/lib/data/hooks";

const ROLE_LABEL: Record<string, string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  cashier: "Caissier",
  stock: "Stock",
  accountant: "Comptable",
};


export function UserMenu() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();

  const email = user?.email ?? "";
  // profiles.full_name (modifiable dans Profil) prévaut sur les métadonnées
  // auth figées à l'inscription — sans ça, un changement de nom dans Profil
  // ne se reflétait jamais ici.
  const fullName = profile?.full_name || (user?.user_metadata?.full_name as string | undefined) || email.split("@")[0] || "Utilisateur";
  const initials = fullName
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase()).join("") || "U";
  const role = (user?.user_metadata?.role as string | undefined) ?? "owner";
  const avatarUrl = profile?.avatar_url;

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/connexion" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1 pl-1 pr-2.5 transition-colors hover:bg-muted">
          <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-primary to-primary-glow text-xs font-bold text-primary-foreground">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-xs font-semibold text-foreground">{fullName}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {ROLE_LABEL[role] ?? role}
            </div>
          </div>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2.5">
          <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-primary to-primary-glow text-sm font-bold text-primary-foreground">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">{fullName}</div>
            <div className="truncate text-[11px] text-muted-foreground">{email}</div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/profil" className="cursor-pointer gap-2.5">
            <UserCircle className="h-4 w-4" /> Modifier le profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/profil" className="cursor-pointer gap-2.5">
            <KeyRound className="h-4 w-4" /> Modifier le mot de passe
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/abonnement" className="cursor-pointer gap-2.5">
            <CreditCard className="h-4 w-4" /> Gérer mon abonnement
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/support" className="cursor-pointer gap-2.5">
            <LifeBuoy className="h-4 w-4" /> Contacter le support
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer gap-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

