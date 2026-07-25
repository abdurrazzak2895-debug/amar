import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Calendar, Plus, WalletCards, ClipboardList } from "lucide-react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";

const navItems = [
  { to: "/dashboard", label: "Account Dashboard", icon: LayoutDashboard },
  { to: "/exam/reservations", label: "My bookings", icon: Calendar },
  { to: "/exam/sessions", label: "Exam Sessions", icon: ClipboardList },
  { to: "/exam/booking", label: "New booking", icon: Plus },
  { to: "/wallet", label: "Wallet & credits", icon: WalletCards },
];

export default function Sidebar() {
  const location = useLocation();
  const { hasPermission } = useAccessAuth();

  return (
    <aside className="hidden w-[246px] border-r border-border bg-sidebar p-5 lg:block">
      {/* Brand */}
      <div className="mb-14 flex items-center gap-3">
        <div className="h-[26px] w-[42px] rounded-br-[20px] rounded-tl-[20px] rounded-tr-[20px] bg-gradient-to-br from-primary to-accent" />
        <div className="leading-tight">
          <strong className="block text-sm text-foreground">Professional</strong>
          <span className="block text-sm text-primary">Accreditation</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="grid gap-2">
        {navItems.filter((item) => {
          if (item.to === "/exam/booking") return hasPermission("booking.create");
          if (item.to === "/exam/reservations") return hasPermission("reservation.manage");
          return true;
        }).map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-sidebar-active text-sidebar-active-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-hover"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
