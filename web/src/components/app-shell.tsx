"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  Layers3,
  ListTodo,
  LogOut,
  Menu,
  Settings2,
  UserRoundCog,
  UserPlus,
  Users,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import type { Session } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/me/tasks", label: "Task của tôi", icon: ListTodo },
  { href: "/me/report-config", label: "Cấu hình report", icon: Settings2 },
  { href: "/groups", label: "Groups", icon: Layers3 },
  { href: "/members", label: "Thành viên", icon: Users },
  { href: "/audit", label: "Audit", icon: ClipboardList },
  { href: "/me/account", label: "Tài khoản", icon: UserRoundCog },
];

export function AppShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const visibleNavigation =
    session.role === "admin"
      ? [
          ...navigation,
          {
            href: "/admin/accounts/new",
            label: "Thêm account",
            icon: UserPlus,
          },
        ]
      : navigation;
  const links = visibleNavigation.map((item) => {
    const active =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {item.label}
      </Link>
    );
  });

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1536px] items-center gap-4 px-5 md:px-8 2xl:px-10">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
              T
            </span>
            <span className="">
              <span className="block text-sm font-semibold leading-tight">
                Teams Auto Report
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Workspace overview
              </span>
            </span>
          </Link>
          <nav className="hidden min-w-0 items-center gap-0.5 2xl:flex">
            {links}
          </nav>
          <div className="ml-auto hidden shrink-0 items-center gap-3 2xl:flex">
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {session.username} · {session.role}
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut className="size-4" />
                Đăng xuất
              </Button>
            </form>
          </div>
          <div className="ml-auto 2xl:hidden">
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" size="icon" aria-label="Mở menu" />
                }
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="right" className="w-[290px]">
                <SheetHeader>
                  <SheetTitle>Teams Auto Report</SheetTitle>
                  <SheetDescription>
                    {session.username} · {session.role}
                  </SheetDescription>
                </SheetHeader>
                <nav className="space-y-1 px-3 [&_a]:w-full">{links}</nav>
                <div className="mt-auto border-t p-4">
                  <form action={logout}>
                    <Button type="submit" variant="outline" className="w-full">
                      <LogOut className="size-4" />
                      Đăng xuất
                    </Button>
                  </form>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
