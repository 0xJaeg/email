"use client"

import { type ComponentProps } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import {
  IconDashboard,
  IconListDetails,
  IconInnerShadowTop,
  IconClipboardCheck,
  IconUsers,
  IconTicket,
  IconBox,
  IconInbox,
  IconKey,
  IconBolt,
  IconSitemap,
  IconTemplate,
} from "@tabler/icons-react"
import { NavMain } from "@/components/layout/nav-main"
import { NavUser } from "@/components/layout/nav-user"

type NavUserData = {
  name: string
  email: string
  role: string
}

const overview = {
  label: "Overview",
  items: [{ title: "Dashboard", url: "/", icon: <IconDashboard /> }],
}

const operations = {
  label: "Operations",
  items: [
    { title: "Tickets", url: "/tickets", icon: <IconTicket /> },
    { title: "Approvals", url: "/approvals", icon: <IconClipboardCheck /> },
    { title: "Activity", url: "/activity", icon: <IconListDetails /> },
  ],
}

// Admin-only groups — operators see Overview + Operations only.
const configuration = {
  label: "Configuration",
  items: [
    { title: "Products", url: "/products", icon: <IconBox /> },
    { title: "Inboxes", url: "/inboxes", icon: <IconInbox /> },
    { title: "API keys", url: "/credentials", icon: <IconKey /> },
    { title: "Triggers", url: "/triggers", icon: <IconBolt /> },
    { title: "Templates", url: "/templates", icon: <IconTemplate /> },
    { title: "Decision flow", url: "/flows", icon: <IconSitemap /> },
  ],
}

const admin = {
  label: "Admin",
  items: [{ title: "Users", url: "/users", icon: <IconUsers /> }],
}

export function AppSidebar({
  user,
  ...props
}: ComponentProps<typeof Sidebar> & { user: NavUserData }) {
  const groups =
    user.role === "admin"
      ? [overview, operations, configuration, admin]
      : [overview, operations]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="flex flex-row items-center justify-between gap-2 border-b group-data-[collapsible=icon]:justify-center">
        <SidebarMenu className="group-data-[collapsible=icon]:hidden">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="#">
                <IconInnerShadowTop className="size-5!" />
                <span className="font-mono text-base font-semibold">
                  UM Email Agent
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
