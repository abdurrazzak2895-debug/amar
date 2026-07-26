import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity, Building2, CircleUserRound, Database, FileSliders,
  LayoutDashboard, LogOut, Megaphone, Plus, SearchCheck, Server, ShieldCheck, Users, WalletCards,
} from "lucide-react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi, accessAgencyApi } from "@/lib/access-api";
import "@/styles/access-dashboard-premium.css";
import "@/styles/access-admin-analytics.css";

interface Account {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  created_at?: string;
}

interface AdminDashboardData {
  stats: { totalAccounts: number; agencies: number; agencyUsers: number; realSvpAccounts: number; linkedSvpAccounts: number; completedBookings: number; successfulPayments: number };
  agencies: Array<{
    id: string; name: string; email: string; status: string; createdAt?: string | null;
    userCount: number; svpAccountCount: number; completedBookings: number; paidPayments: number;
    users: Array<{ id: string; name: string; email: string; phone?: string | null; status: string; createdAt?: string | null; svpAccountCount: number; completedBookings: number; paidPayments: number }>;
  }>;
  recentPayments: Array<{ id: string; reservationId?: string | null; accountName: string; agencyName?: string | null; svpLogin: string; status: string; paid: boolean; amount?: number | null; currency?: string | null; createdAt?: string | null }>;
  recentAccounts: Account[];
  live: { sessionAccounts: number; syncedAccounts: number; syncFailures: number; truncated: boolean; refreshedAt: string };
}

function initials(name?: string) {
  return String(name || "User").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value?: string) {
  if (!value) return "Recently";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AccessDashboardPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError("");
      try {
        if (isAdmin) {
          const dashboard = await accessAdminApi<AdminDashboardData>("/dashboard");
          if (active) { setAdminDashboard(dashboard); setAccounts(dashboard.recentAccounts || []); }
        } else {
          const nextAccounts = (await accessAgencyApi<{ users: Account[] }>("/users")).users;
          if (active) setAccounts(nextAccounts || []);
        }
      } catch (error: unknown) {
        const value = error as { message?: string };
        if (active) setError(value.message || "Could not load dashboard data");
      } finally { if (active) setLoading(false); }
    }
    if (user) void load();
    return () => { active = false; };
  }, [isAdmin, user]);

  const stats = useMemo(() => {
    const active = accounts.filter((item) => item.status === "ACTIVE").length;
    const inactive = accounts.length - active;
    if (isAdmin) return [
      ["Agency users", adminDashboard?.stats.agencyUsers ?? 0, "Users created under agencies", "blue"],
      ["Agencies", adminDashboard?.stats.agencies ?? 0, "Agency partners", "gold"],
      ["Real SVP accounts", adminDashboard?.stats.realSvpAccounts ?? 0, `${adminDashboard?.stats.linkedSvpAccounts ?? 0} matched to portal users`, "green"],
      ["Completed bookings", adminDashboard?.stats.completedBookings ?? 0, "Live SVP reservations", "blue"],
      ["Successful payments", adminDashboard?.stats.successfulPayments ?? 0, "Includes direct SVP checkout", "green"],
      ["All portal accounts", adminDashboard?.stats.totalAccounts ?? 0, "Admin, agency and user", "gold"],
    ];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return [
      ["My users", accounts.length, "Users in your agency", "blue"],
      ["Active", active, "Currently active users", "green"],
      ["Inactive", inactive, "Awaiting activation / suspended", "red"],
      ["Active this week", accounts.filter((item) => item.created_at && new Date(item.created_at).getTime() >= weekAgo).length, "Recently added users", "gold"],
    ];
  }, [accounts, adminDashboard, isAdmin]);

  function handleLogout() { logout(); navigate("/access/login"); }

  return (
    <div className="ap-shell">
      <aside className="ap-sidebar">
        <div className="ap-brand"><span className="ap-brand__mark">A</span><div><strong>Access</strong><small>{isAdmin ? "ADMIN CONSOLE" : "AGENCY CONSOLE"}</small></div></div>
        <nav className="ap-nav">
          <small>OVERVIEW</small>
          <Link className="ap-nav__link ap-nav__link--active" to="/access/dashboard"><LayoutDashboard />Dashboard</Link>
          {isAdmin ? <>
            <small>ACCESS CONTROL</small>
            <Link className="ap-nav__link" to="/access/accounts"><Users />All Accounts</Link>
            <Link className="ap-nav__link" to="/access/finance"><WalletCards />Permissions & Wallets</Link>
            <Link className="ap-nav__link" to="/access/notice"><Megaphone />Notice</Link>
            <Link className="ap-nav__link" to="/access/agencies"><Building2 />Create Agency</Link>
            <Link className="ap-nav__link" to="/access/users"><CircleUserRound />Create Users</Link>
            <small>INFRASTRUCTURE</small>
            <Link className="ap-nav__link" to="/access/session-centers"><Server />Session Centers</Link>
            <Link className="ap-nav__link" to="/access/section-rules"><FileSliders />Section Rules</Link>
            <Link className="ap-nav__link" to="/access/result-verification"><SearchCheck />Result Verification</Link>
          </> : <>
            <small>AGENCY</small>
            <Link className="ap-nav__link" to="/access/users"><Users />My Users</Link>
          </>}
        </nav>
        <div className="ap-sidebar__foot">Access Control · v2</div>
      </aside>

      <main className="ap-main">
        <header className="ap-topbar">
          <div><small>{isAdmin ? "ADMIN CONSOLE" : "AGENCY CONSOLE"}</small><strong>Welcome back, {user?.name || "User"}</strong></div>
          <div className="ap-account"><span className={`ap-role ap-role--${isAdmin ? "admin" : "agency"}`}>{user?.role}</span><span className="ap-avatar">{initials(user?.name)}</span><div><strong>{user?.name}</strong><small>{user?.email}</small></div><button onClick={handleLogout}><LogOut />Logout</button></div>
        </header>

        <section className="ap-hero">
          <span className="ap-hero__ring ap-hero__ring--one"/><span className="ap-hero__ring ap-hero__ring--two"/>
          <div className="ap-eyebrow"><ShieldCheck />{isAdmin ? "SYSTEM ADMINISTRATOR" : "AGENCY WORKSPACE"}</div>
          <h1>{isAdmin ? "Control every account, agency and exam centre from one command centre." : "Manage your team of exam-booking users with confidence."}</h1>
          <p>{isAdmin ? "Provision agencies, create users, configure session centres and adjust section rules — every change stays visible in real time." : "Create users, monitor account health and keep your agency team ready for every booking."}</p>
          <div className="ap-hero__actions">
            {isAdmin ? <><Link className="ap-btn ap-btn--gold" to="/access/agencies"><Plus />New Agency</Link><Link className="ap-btn" to="/access/users"><Plus />New User</Link><Link className="ap-btn" to="/access/accounts">Manage Accounts →</Link></> : <Link className="ap-btn ap-btn--gold" to="/access/users"><Plus />Add User</Link>}
          </div>
        </section>

        {error && <div className="ap-error">{error}</div>}
        <section className="ap-stats">{stats.map(([label, value, note, tone]) => <article className="ap-stat" key={String(label)}><small>{label}</small><strong className={`ap-tone--${tone}`}>{loading ? "…" : value}</strong><span>{note}</span></article>)}</section>

        {isAdmin && <section className="ap-infra">
          <Link className="ap-infra__card" to="/access/session-centers"><Server /><div><small>SESSION CENTERS</small><strong>Manage</strong></div></Link>
          <Link className="ap-infra__card" to="/access/section-rules"><FileSliders /><div><small>SECTION RULES</small><strong>Configure</strong></div></Link>
          <Link className="ap-infra__card" to="/access/test-centers"><Database /><div><small>TEST CENTERS</small><strong>Review</strong></div></Link>
        </section>}

        {isAdmin && adminDashboard && <>
          <section className="ap-panel ap-agency-overview">
            <header><div><small>AGENCY OWNERSHIP</small><h2>Agency users and SVP activity</h2></div><span className="ap-live-note">Live sync {adminDashboard.live.syncedAccounts}/{adminDashboard.live.sessionAccounts}{adminDashboard.live.truncated ? " (latest 50)" : ""} · {formatDate(adminDashboard.live.refreshedAt)}</span></header>
            <div className="ap-agency-list">
              {adminDashboard.agencies.map((agency) => <details className="ap-agency-card" key={agency.id}>
                <summary><div><strong>{agency.name}</strong><small>{agency.email} · Created {formatDate(agency.createdAt || undefined)}</small></div><span><b>{agency.userCount}</b> users</span><span><b>{agency.svpAccountCount}</b> SVP</span><span><b>{agency.completedBookings}</b> bookings</span><span><b>{agency.paidPayments}</b> paid</span></summary>
                <div className="ap-agency-users">
                  <div className="ap-agency-user ap-agency-user--head"><span>User</span><span>Created</span><span>SVP accounts</span><span>Bookings</span><span>Payments</span><span>Status</span></div>
                  {agency.users.map((agencyUser) => <div className="ap-agency-user" key={agencyUser.id}><span><strong>{agencyUser.name}</strong><small>{agencyUser.email} · {agencyUser.phone || "No phone"}</small></span><time>{formatDate(agencyUser.createdAt || undefined)}</time><b>{agencyUser.svpAccountCount}</b><b>{agencyUser.completedBookings}</b><b>{agencyUser.paidPayments}</b><span className={`ap-status ap-status--${agencyUser.status === "ACTIVE" ? "active" : "inactive"}`}>{agencyUser.status}</span></div>)}
                  {!agency.users.length && <p className="ap-muted">This agency has not created any users yet.</p>}
                </div>
              </details>)}
              {!adminDashboard.agencies.length && <p className="ap-muted">No agencies found.</p>}
            </div>
          </section>

          <section className="ap-panel ap-payment-activity">
            <header><div><small>SVP LIVE PAYMENTS</small><h2>Recent direct and portal payment activity</h2></div>{adminDashboard.live.syncFailures > 0 && <span className="ap-sync-warning">{adminDashboard.live.syncFailures} expired/unavailable session(s)</span>}</header>
            <div className="ap-payment-table"><div className="ap-payment-row ap-payment-row--head"><span>Account</span><span>Agency</span><span>Reservation</span><span>Amount</span><span>Date</span><span>Status</span></div>
              {adminDashboard.recentPayments.map((payment) => <div className="ap-payment-row" key={`${payment.svpLogin}:${payment.id}`}><span><strong>{payment.accountName}</strong><small>{payment.svpLogin}</small></span><span>{payment.agencyName || "Independent"}</span><span>#{payment.reservationId || "-"}</span><b>{payment.amount == null ? "-" : `${payment.amount.toFixed(2)} ${payment.currency || ""}`}</b><time>{formatDate(payment.createdAt || undefined)}</time><span className={`ap-status ap-status--${payment.paid ? "active" : "inactive"}`}>{payment.status}</span></div>)}
              {!adminDashboard.recentPayments.length && <p className="ap-muted">No SVP payment activity is available from active sessions.</p>}
            </div>
          </section>
        </>}

        <section className="ap-grid">
          <article className="ap-panel ap-list"><header><div><small>RECENT ACTIVITY</small><h2>{isAdmin ? "Recently created accounts" : "Your agency users"}</h2></div><Link to={isAdmin ? "/access/accounts" : "/access/users"}>View all</Link></header>
            {loading ? <p className="ap-muted">Loading live accounts…</p> : accounts.slice(0, 6).map((item) => <div className="ap-row" key={item.id}><span className="ap-row__avatar">{initials(item.name)}</span><div><strong>{item.name}</strong><small>{item.email}{item.phone ? ` · ${item.phone}` : ""}</small></div><span className="ap-row__role">{item.role}</span><time>{formatDate(item.created_at)}</time><span className={`ap-status ap-status--${item.status === "ACTIVE" ? "active" : "inactive"}`}>● {item.status}</span></div>)}
            {!loading && !accounts.length && <p className="ap-muted">No accounts found.</p>}
          </article>
          <aside className="ap-panel ap-quick"><small>SHORTCUTS</small><h2>Quick Actions</h2>{isAdmin && <><Link to="/access/agencies"><Building2 />Create Agency</Link><Link to="/access/finance"><WalletCards />Permissions & Wallets</Link></>}<Link to="/access/users"><Users />{isAdmin ? "Create User" : "Manage My Users"}</Link><div className="ap-self"><Activity /><div><small>YOUR ACCOUNT</small><strong>{user?.status}</strong><span>{user?.email}</span></div></div></aside>
        </section>
      </main>
    </div>
  );
}
