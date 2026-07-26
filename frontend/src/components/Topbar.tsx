import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccessAuth } from "@/contexts/AccessAuthContext";

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasPermission } = useAccessAuth();

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    navigate("/auth/login");
  }

  return (
    <>
      <header className="flex h-[62px] items-center justify-between border-b border-border bg-card px-4 lg:justify-end lg:px-8">
        {/* Mobile menu */}
        <button className="lg:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          <Menu className="h-5 w-5 text-foreground" />
        </button>

        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-muted-foreground">العربية</span>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-muted" />
            <div className="hidden sm:block">
              <strong className="block text-sm text-foreground">{user?.name || user?.login || "User"}</strong>
              <span className="block text-xs text-muted-foreground">{user?.role || "Labor"}</span>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleLogout}
              disabled={loggingOut}
              className="ml-2"
            >
              <LogOut className="mr-1 h-3.5 w-3.5" />
              {loggingOut ? "..." : "Logout"}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="border-b border-border bg-card p-4 lg:hidden">
          <nav className="grid gap-2">
            <Link to="/dashboard" className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted" onClick={() => setMobileOpen(false)}>Dashboard</Link>
            <Link to="/exam/sessions" className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted" onClick={() => setMobileOpen(false)}>Exam Sessions</Link>
            {hasPermission("reservation.manage") && <Link to="/exam/reservations" className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted" onClick={() => setMobileOpen(false)}>My bookings</Link>}
            {hasPermission("booking.create") && <Link to="/exam/booking" className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted" onClick={() => setMobileOpen(false)}>New booking</Link>}
            <Link to="/wallet" className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted" onClick={() => setMobileOpen(false)}>Wallet & credits</Link>
          </nav>
        </div>
      )}
    </>
  );
}
