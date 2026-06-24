import { AppSidebar } from "@/components/layout/app-sidebar"
import { SiteHeader } from "@/components/layout/site-header"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export default async function OverviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("name, email, role")
    .eq("id", user.id)
    .single()

  const navUser = {
    name: profile?.name ?? user.email ?? "Operator",
    email: profile?.email ?? user.email ?? "",
    role: profile?.role ?? "operator",
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={navUser} />
      <SidebarInset className="min-w-0">
        <SiteHeader />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col p-2 lg:p-4">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
