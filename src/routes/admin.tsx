import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Shield, ArrowUpRight, Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import { AdminBottomNav } from "@/components/admin/AdminBottomNav";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIsSuperAdmin } from "@/lib/data/adminHooks";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Super Admin — NovaCaisse" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: isSuperAdmin, isLoading: adminLoading } = useIsSuperAdmin();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/admins" }); return; }
    if (!adminLoading && !isSuperAdmin) navigate({ to: "/app" });
  }, [authLoading, adminLoading, user, isSuperAdmin, navigate]);

  if (authLoading || adminLoading || !user || !isSuperAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-5">
            <SidebarTrigger className="h-10 w-10 rounded-xl" />
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest">Back-office</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">v1.0</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <a href="/" className="hidden items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted sm:inline-flex">
                Voir le site <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
              <ThemeToggle />
              <AdminUserMenu />
            </div>
          </header>
          <main className="flex-1 min-w-0 pb-16 md:pb-0">
            <Outlet />
          </main>
        </div>
        <AdminBottomNav />
      </div>
    </SidebarProvider>
  );
}
