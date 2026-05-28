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
} from "@tabler/icons-react"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"

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
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
