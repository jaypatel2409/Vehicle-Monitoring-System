// Frontend/src/components/layout/Sidebar.tsx
// PATCH: Add the Daily Counts nav item.
//
// Find the navItems array in your existing Sidebar.tsx and add this entry:
//
//   import { BarChart3 } from "lucide-react";   ← add to your existing imports
//
//   { name: "Daily Counts", href: "/daily-counts", icon: BarChart3 }
//
// ─── FULL REPLACEMENT FILE ────────────────────────────────────────────────────
// Replace your entire Sidebar.tsx with the content below.
// The ONLY change from your Session 3 Sidebar is the added "Daily Counts" item.

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Settings,
  Car,
  Activity,
  BarChart3,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Vehicle Monitoring", href: "/monitoring", icon: Activity },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Daily Counts", href: "/daily-counts", icon: BarChart3 },   // ← NEW
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-30 h-full w-64 bg-white border-r border-gray-200 flex flex-col shadow-lg transition-transform duration-300",
          "lg:static lg:translate-x-0 lg:shadow-none",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo / Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Car className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-base">VMS</span>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 text-xs text-gray-400">
          Vehicle Monitoring System
        </div>
      </aside>
    </>
  );
}