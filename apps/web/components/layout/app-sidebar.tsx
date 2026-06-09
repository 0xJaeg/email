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
  IconFileText,
  IconBox,
  IconInbox,
} from "@tabler/icons-react"
import { NavMain } from "@/components/layout/nav-main"
import { NavUser } from "@/components/layout/nav-user"

type NavUserData = {
  name: string
  email: string
  role: string
}

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: <IconDashboard />,
    },
    {
      title: "Tickets",
      url: "/tickets",
      icon: <IconTicket />,
    },
    {
      title: "Activity",
      url: "/activity",
      icon: <IconListDetails />,
    },
    {
      title: "Approvals",
      url: "/approvals",
      icon: <IconClipboardCheck />,
    },
  ],
}

export function AppSidebar({
  user,
  ...props
}: ComponentProps<typeof Sidebar> & { user: NavUserData }) {
  const navMain =
    user.role === "admin"
      ? [
          ...data.navMain,
          { title: "Products", url: "/products", icon: <IconBox /> },
          { title: "Inboxes", url: "/inboxes", icon: <IconInbox /> },
          { title: "Prompts", url: "/prompts", icon: <IconFileText /> },
          { title: "Users", url: "/users", icon: <IconUsers /> },
        ]
      : data.navMain

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
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
