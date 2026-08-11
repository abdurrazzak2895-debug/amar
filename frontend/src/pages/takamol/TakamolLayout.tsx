import { NavLink, Outlet, Link } from "react-router-dom";
import { CalendarCheck, LayoutDashboard, ListChecks, Search, Ticket, BarChart3, ArrowLeft, LogIn } from "lucide-react";
import { useTakamolAuth } from "@/contexts/TakamolAuthContext";
import "@/styles/takamol.css";

const NAV_ITEMS = [
  { to: "/takamol/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/takamol/booking", label: "Book Exam", icon: CalendarCheck },
  { to: "/takamol/reservations", label: "Reservations", icon: ListChecks },
  { to: "/takamol/sessions", label: "Sessions", icon: Ticket },
  { to: "/takamol/results", label: "Results", icon: BarChart3 },
  { to: "/takamol/search", label: "Search", icon: Search },
];

export default function TakamolLayout() {
  const { loggedIn, loading, logout } = useTakamolAuth();

  return (
    <div className="tk-shell">
      <header className="tk-topbar">
        <Link to="/takamol/dashboard" className="tk-brand" style={{ textDecoration: "none", color: "var(--tk-text)" }}>
          <span className="tk-logo">T</span>
          <span>Takamol Live Console</span>
        </Link>

        <nav className="tk-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === "/takamol/dashboard"}>
                <Icon size={15} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="tk-nav">
          {loading ? (
            <span className="tk-badge">
              <span className="tk-spinner" style={{ width: 12, height: 12 }} />
              Checking…
            </span>
          ) : loggedIn ? (
            <span className="tk-badge tk-badge--ok">
              <span className="tk-dot tk-dot--ok" />
              Logged in
            </span>
          ) : (
            <NavLink to="/takamol/login" className="tk-badge tk-badge--warn">
              <LogIn size={12} />
              Not logged in
            </NavLink>
          )}
          {loggedIn && (
            <button type="button" className="tk-navbtn" onClick={() => logout()}>
              Logout
            </button>
          )}
          <Link to="/dashboard" className="tk-navbtn" style={{ textDecoration: "none" }}>
            <ArrowLeft size={14} />
            Main App
          </Link>
        </div>
      </header>

      <main className="tk-container">
        <Outlet />
      </main>
    </div>
  );
}
