"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  Landmark,
  RefreshCw,
  Settings,
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/transactions", icon: Receipt, label: "History" },
  { path: "/recurring", icon: RefreshCw, label: "Recurring" },
  { path: "/net-worth", icon: Landmark, label: "Net Worth" },
  { path: "/reports", icon: BarChart3, label: "Reports" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout({ children }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-20 md:pb-6">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-50">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = pathname === path;
            return (
              <Link
                key={path}
                href={path}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 rounded-xl transition-all ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 bg-card border-r border-border flex-col items-center py-8 gap-2 z-50">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-8">
          <span className="text-primary-foreground font-heading font-bold text-lg">
            $
          </span>
        </div>
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              href={path}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
