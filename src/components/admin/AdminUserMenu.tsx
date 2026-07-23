import { Link, useNavigate } from "@tanstack/react-router";
import { UserCircle, LogOut, ChevronDown } from "lucide-react";
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

// Remplace le badge "Digitorizon / DT" codé en dur qui s'affichait ici
// quel que soit le super-admin réellement connecté — jamais relié à
// l'utilisateur authentifié (Bloc 26).
export function AdminUserMenu() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();

  const email = user?.email ?? "";
  const fullName = profile?.full_name || email.split("@")[0] || "Super Admin";
  const initials = fullName
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase()).join("") || "A";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/admins" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1 pl-1 pr-2.5 transition-colors hover:bg-muted">
          <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-foreground to-foreground/70 text-xs font-bold text-background">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-xs font-semibold text-foreground">{fullName}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Super Admin</div>
          </div>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-60">
        <DropdownMenuLabel className="flex items-center gap-3 py-2.5">
          <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-foreground to-foreground/70 text-sm font-bold text-background">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">{fullName}</div>
            <div className="truncate text-[11px] text-muted-foreground">{email}</div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/admin/profil" className="cursor-pointer gap-2.5">
            <UserCircle className="h-4 w-4" /> Modifier le profil
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
